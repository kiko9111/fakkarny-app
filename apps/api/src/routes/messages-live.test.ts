import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { INSTALL_ID_HEADER, PostMessageResponse, REPLY_STREAM_HEADER, type FriendResponse } from "@fakkarni/shared";
import { buildApp } from "../app";
import type { FriendModel, FriendModelResult } from "../ai/model";
import type { ReplyLive } from "../ai/respond-stream";
import { createConversationPipeline } from "../pipeline/conversation";
import type { MessagePipeline } from "../pipeline/types";
import { hasTestDb, resetDb, testPrisma } from "../../test/db";
import { RESPOND, startStandIn, streamed, whole } from "../../test/anthropic-standin";
import { createAnthropicModel } from "../ai/model";
import { createMetrics } from "../observability/metrics";

const usage = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 3000, cache_creation_input_tokens: 0 };
const ok = (output: Partial<FriendResponse> & { reply: string[] }): FriendModelResult => ({ ok: true, usage, stream: "eager", output: { create_items: [], update_items: [], save_memories: [], crisis: false, ...output } });

/** One scripted turn: the words are passed on one by one (as the model layer does), then the turn ends as told. */
type Turn = { result: FriendModelResult | Error; write?: string[] };
function liveModel(turns: Turn[]) {
  const seen: (ReplyLive | undefined)[] = [];
  const model: FriendModel = {
    async respond(_input, live) {
      seen.push(live);
      const turn = turns.shift();
      if (!turn) throw new Error("no scripted turn");
      const write = turn.write ?? (turn.result instanceof Error || !turn.result.ok ? [] : turn.result.output.reply);
      for (const [bubble, text] of write.entries()) for (const word of text.split(/(?<=\s)/)) live?.onReply(bubble, word);
      live?.onReplyEnd();
      if (turn.result instanceof Error) {
        live?.onRestart();
        throw turn.result;
      }
      return turn.result;
    },
    async complete() {
      return { text: "summary", usage };
    },
  };
  return { model, seen };
}

/** The events of a streamed answer, in order. */
function events(payload: string): { event: string; data: any }[] {
  return payload
    .split("\n\n")
    .map((block) => {
      const lines = block.split("\n").filter((l) => l && !l.startsWith(":"));
      const event = lines.find((l) => l.startsWith("event: "))?.slice(7);
      const data = lines.find((l) => l.startsWith("data: "))?.slice(6);
      return event && data ? { event, data: JSON.parse(data) } : null;
    })
    .filter((e): e is { event: string; data: any } => e !== null);
}

/** What a phone would be showing after these events. */
function drawn(list: { event: string; data: any }[]): string[] {
  let bubbles: string[] = [];
  for (const e of list) {
    if (e.event === "reset") bubbles = [];
    if (e.event === "draft") bubbles[e.data.i] = (bubbles[e.data.i] ?? "") + e.data.d;
  }
  return bubbles;
}

describe("the line that tells phones to ask for a stream", () => {
  it("is on every answer while the server sends replies as they are written, and only then", async () => {
    let sends = true;
    const app = buildApp({ logger: false }, { liveReplies: () => sends });
    expect((await app.inject({ url: "/health" })).headers[REPLY_STREAM_HEADER]).toBe("1");
    // Also on an answer that is not a success: a phone must not read a 404 as "streams are off".
    expect((await app.inject({ url: "/nothing-here" })).headers[REPLY_STREAM_HEADER]).toBe("1");
    // Switched off, refused by the model's API or paused: phones stop asking.
    sends = false;
    expect((await app.inject({ url: "/health" })).headers[REPLY_STREAM_HEADER]).toBeUndefined();
    // A server that was never told (no model): never there.
    expect((await buildApp({ logger: false }).inject({ url: "/health" })).headers[REPLY_STREAM_HEADER]).toBeUndefined();
  });
});

describe.skipIf(!hasTestDb)("POST /messages as a stream", () => {
  const prisma = testPrisma();
  const now = new Date("2026-11-19T10:00:00.000Z");
  const headers = { [INSTALL_ID_HEADER]: randomUUID() };
  const STREAM = { ...headers, accept: "text/event-stream, application/json" };

  beforeEach(() => resetDb(prisma));
  afterAll(() => prisma.$disconnect());

  const appWith = (model: FriendModel) => buildApp({ logger: false }, { prisma, now: () => now, pipeline: createConversationPipeline({ model }) });
  const post = (app: ReturnType<typeof buildApp>, text: string, h: Record<string, string>, extra: Record<string, unknown> = {}) =>
    app.inject({ method: "POST", url: "/messages", headers: h, payload: { client_id: randomUUID(), text, created_at: now.toISOString(), timezone: "Africa/Cairo", ...extra } });

  it("sends the words while they are written, then the same answer the plain POST gives", async () => {
    const reply = ["صباح النور يا منى، يومك عامل إيه النهارده؟", "قوليلي أخبارك"];
    const { model, seen } = liveModel([{ result: ok({ reply }) }]);
    const app = appWith(model);
    const res = await post(app, "صباح الخير يا زكي", STREAM);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^text\/event-stream/);
    expect(res.headers["cache-control"]).toContain("no-transform");
    expect(res.headers["content-encoding"]).toBeUndefined();
    expect(seen[0]).toBeDefined();

    const list = events(res.payload);
    expect(list.at(-1)!.event).toBe("done");
    expect(list.filter((e) => e.event === "done")).toHaveLength(1);
    expect(list.filter((e) => e.event === "draft").length).toBeGreaterThan(3);
    expect(drawn(list)).toEqual(reply);

    const done = list.at(-1)!.data;
    expect(done.status).toBe(201);
    const body = PostMessageResponse.parse(done.body);
    expect(body.replies.map((r) => r.text)).toEqual(reply);
    expect(body.duplicate).toBe(false);
    expect(done.timing.first).toBeGreaterThanOrEqual(0);
    expect(done.timing.total).toBeGreaterThanOrEqual(done.timing.first);

    // Stored exactly as a plain answer is: the phone asking again gets the same replies.
    const stored = await app.inject({ method: "GET", url: "/messages", headers });
    expect(stored.json().messages.filter((m: { role: string }) => m.role === "friend").map((m: { text: string }) => m.text)).toEqual(reply);
    // How long the first words took is counted (numbers only).
    await expect.poll(async () => ((await prisma.event.findFirst({ where: { name: "chat_timing" } }))?.propsJson as { first?: number } | null)?.first).toBeTypeOf("number");
    expect(((await prisma.event.findFirst({ where: { name: "ai_call" } }))!.propsJson as { stream?: string }).stream).toBe("eager");
  });

  it("answers a phone that did not ask for a stream exactly as before", async () => {
    const { model, seen } = liveModel([{ result: ok({ reply: ["أهلا يا منى"] }) }]);
    const res = await post(appWith(model), "ازيك يا زكي", headers);
    expect(res.statusCode).toBe(201);
    expect(res.headers["content-type"]).toMatch(/^application\/json/);
    expect(res.headers["server-timing"]).toContain("total;dur=");
    expect(PostMessageResponse.parse(res.json()).replies.map((r) => r.text)).toEqual(["أهلا يا منى"]);
    // Nobody reads along: the model is asked the old way.
    expect(seen).toEqual([undefined]);
  });

  it("answers at once, without a stream, when the rules answer", async () => {
    const { model, seen } = liveModel([]);
    const res = await post(appWith(model), "شكرا", STREAM);
    expect(res.statusCode).toBe(201);
    expect(res.headers["content-type"]).toMatch(/^application\/json/);
    expect(PostMessageResponse.parse(res.json()).replies).toHaveLength(1);
    expect(seen).toHaveLength(0);
  });

  it("keeps back the sentence that says a reminder is set until the turn is done", async () => {
    const reply = ["تمام يا منى. هفكرك الساعة ٥ تكلمي ماما 💛"];
    const { model } = liveModel([{ result: ok({ reply, create_items: [{ type: "reminder", title: "كلمي ماما", remind_at_local: "2026-11-19T17:00" }] }) }]);
    const res = await post(appWith(model), "فكرني الساعة ٥ اكلم ماما", STREAM);
    const list = events(res.payload);
    expect(drawn(list)).toEqual(["تمام يا منى."]);
    const body = PostMessageResponse.parse(list.at(-1)!.data.body);
    expect(body.replies.map((r) => r.text)).toEqual(reply);
    expect(body.items).toHaveLength(1);
  });

  it("takes the draft back when the reply is written again", async () => {
    const second = ["أهلا يا منى، أنا هنا"];
    const { model } = liveModel([
      { result: new Error("the stream broke"), write: ["أهلا يا منى يا جميلة يا قمر"] },
      { result: ok({ reply: second }) },
    ]);
    const res = await post(appWith(model), "ازيك يا زكي", STREAM);
    const list = events(res.payload);
    const kinds = list.map((e) => e.event);
    expect(kinds.indexOf("reset")).toBeGreaterThan(kinds.indexOf("draft"));
    expect(kinds.lastIndexOf("draft")).toBeGreaterThan(kinds.indexOf("reset"));
    expect(drawn(list)).toEqual(second);
    // "First words" is about the words that stayed.
    expect(list.at(-1)!.data.timing.first).toEqual(expect.any(Number));
    expect(PostMessageResponse.parse(list.at(-1)!.data.body).replies.map((r) => r.text)).toEqual(second);
  });

  it("takes the draft back before it says what could not be done", async () => {
    // The model says it is done; the app then finds nothing to do it to.
    const promise = ["تمام يا منى، لغيت دين عبد الكريم خلاص"];
    const { model } = liveModel([{ result: ok({ reply: promise, app_actions: [{ kind: "daftar_cancel", person: "عبد الكريم" }] } as never) }]);
    const res = await post(appWith(model), "الغي دين عبد الكريم", STREAM);
    const list = events(res.payload);
    const kinds = list.map((e) => e.event);
    expect(kinds).toContain("draft");
    // Taken back before the answer, and nothing shown after that.
    expect(kinds.indexOf("reset")).toBeGreaterThan(kinds.lastIndexOf("draft"));
    expect(kinds.at(-1)).toBe("done");
    expect(drawn(list)).toEqual([]);
    const stored = PostMessageResponse.parse(list.at(-1)!.data.body).replies.map((r) => r.text);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toContain("عبد الكريم");
    expect(stored[0]).not.toContain("لغيت");
    // The words that were taken back are not the turn's "first words".
    expect(list.at(-1)!.data.timing.first).toBeUndefined();
  });

  it("records that a streamed try was lost and the turn read whole (kinds only)", async () => {
    const lost = { ...ok({ reply: ["أهلا يا منى"] }), stream: undefined, streamLost: "timeout" } as FriendModelResult;
    const { model } = liveModel([{ result: lost, write: [] }]);
    const res = await post(appWith(model), "ازيك يا زكي", STREAM);
    expect(res.statusCode).toBe(201);
    const call = await prisma.event.findFirstOrThrow({ where: { name: "ai_call" } });
    expect(call.propsJson).toMatchObject({ purpose: "chat", stream_lost: "timeout" });
    expect(call.propsJson).not.toHaveProperty("stream");
  });

  it("never shows a reply in the wrong script", async () => {
    const { model } = liveModel([{ result: ok({ reply: ["Sabah el kheir ya Mona, 3amla eh?"] }) }]);
    const res = await post(appWith(model), "صباح الخير", STREAM);
    // Nothing to show: the answer is plain JSON.
    expect(res.statusCode).toBe(201);
    expect(res.headers["content-type"]).toMatch(/^application\/json/);
  });

  it("tells a failure on the stream once it is open", async () => {
    const failing: MessagePipeline = async ({ draft }) => {
      draft?.text(0, "أهلا ");
      throw new Error("the database went away");
    };
    const metrics = createMetrics();
    const app = buildApp({ logger: false }, { prisma, now: () => now, pipeline: failing, metrics });
    const res = await post(app, "ازيك", STREAM);
    const list = events(res.payload);
    expect(list.at(-1)).toEqual({ event: "error", data: { status: 500 } });
    // Counted as the failed request it was, though its headers had already said 200.
    await expect.poll(() => metrics.summary()).toEqual({ requests: 1, errors: 1, errorRate: 1 });
    // Without a stream the same failure is a plain 500.
    expect((await post(app, "ازيك", headers)).statusCode).toBe(500);
  });

  it("sends a crisis reply whole, with the helpline, never as a draft", async () => {
    const { model, seen } = liveModel([{ result: ok({ reply: ["أنا جنبك يا منى ومش هسيبك 💛", "احكيلي إيه اللي مضايقك"], crisis: true }) }]);
    const res = await post(appWith(model), "عايز اموت", STREAM);
    expect(res.statusCode).toBe(201);
    expect(res.headers["content-type"]).toMatch(/^application\/json/);
    const body = PostMessageResponse.parse(res.json());
    // The helpline number is in the answer, as on every crisis turn.
    expect(body.replies.some((r) => /\d{3,}/.test(r.text))).toBe(true);
    expect(body.replies.length).toBeGreaterThan(2);
    // The model was asked the old way: nothing was read along.
    expect(seen).toEqual([undefined]);
  });

  it("adds the helpline at the end when the model itself raises the flag", async () => {
    const reply = ["أنا سامعك يا منى وحاسس بيكي 💛"];
    const { model } = liveModel([{ result: ok({ reply, crisis: true }) }]);
    const res = await post(appWith(model), "حاسة اني تعبانة من كل حاجة", STREAM);
    const list = events(res.payload);
    expect(list.at(-1)!.event).toBe("done");
    const body = PostMessageResponse.parse(list.at(-1)!.data.body);
    // The finished answer is the one that counts: the model's words, then the helpline.
    expect(body.replies[0]!.text).toBe(reply[0]);
    expect(body.replies.some((r) => /\d{3,}/.test(r.text))).toBe(true);
    expect(body.items).toHaveLength(0);
  });

  it("does not stream when the phone's own model writes the reply", async () => {
    let got: unknown = "unset";
    const watching: MessagePipeline = async ({ draft }) => {
      got = draft;
      return { replies: [], items: [], memories: [] };
    };
    const app = buildApp({ logger: false }, { prisma, now: () => now, pipeline: watching });
    const res = await post(app, "ازيك", STREAM, { brain: "phone" });
    expect(res.statusCode).toBe(201);
    expect(got).toBeUndefined();
  });

  it("reaches the phone over a real connection while the model is still writing", async () => {
    // The whole path with nothing faked but the model's API: a real socket to this server, the
    // SDK's own stream to a stand-in that stops half-way through the reply until told to go on.
    let goOn: () => void = () => {};
    const wait = new Promise<void>((r) => (goOn = r));
    const standIn = await startStandIn((a) => (a.stream ? streamed({ waitAt: 5, wait }) : whole));
    const app = appWith(createAnthropicModel({ apiKey: "test", baseURL: standIn.baseURL }));
    try {
      await app.listen({ port: 0, host: "127.0.0.1" });
      const { port } = app.server.address() as { port: number };
      const res = await fetch(`http://127.0.0.1:${port}/messages`, {
        method: "POST",
        headers: { ...STREAM, "content-type": "application/json" },
        body: JSON.stringify({ client_id: randomUUID(), text: "صباح الخير يا زكي", created_at: now.toISOString(), timezone: "Africa/Cairo" }),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toMatch(/^text\/event-stream/);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let text = "";
      // The first bubble arrives while the model's API is still held half-way.
      while (!events(text).some((e) => e.event === "draft")) {
        const { done, value } = await reader.read();
        expect(done).toBe(false);
        text += decoder.decode(value, { stream: true });
      }
      expect(events(text).some((e) => e.event === "done")).toBe(false);
      expect(drawn(events(text))[0]).toBe(RESPOND.reply[0]);
      goOn();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
      }
      const list = events(text);
      expect(drawn(list)).toEqual(RESPOND.reply);
      expect(PostMessageResponse.parse(list.at(-1)!.data.body).replies.map((r) => r.text)).toEqual(RESPOND.reply);
      expect(standIn.asked[0]).toMatchObject({ stream: true });
      expect(standIn.asked[0]!.eager[0]).toBe(true);
    } finally {
      goOn();
      await app.close();
      await standIn.close();
    }
  });

  it("answers a message sent again from what was stored, as plain JSON", async () => {
    const { model } = liveModel([{ result: ok({ reply: ["أهلا يا منى"] }) }]);
    const app = appWith(model);
    const clientId = randomUUID();
    const first = await post(app, "ازيك يا زكي", STREAM, { client_id: clientId });
    expect(events(first.payload).at(-1)!.event).toBe("done");
    const again = await post(app, "ازيك يا زكي", STREAM, { client_id: clientId });
    expect(again.statusCode).toBe(200);
    expect(again.headers["content-type"]).toMatch(/^application\/json/);
    expect(PostMessageResponse.parse(again.json())).toMatchObject({ duplicate: true, replies: [{ text: "أهلا يا منى" }] });
  });
});
