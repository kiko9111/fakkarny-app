import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { INSTALL_ID_HEADER, PostMessageResponse, type FriendResponse } from "@fakkarni/shared";
import { buildApp } from "../app";
import type { FriendModel, FriendModelInput, FriendModelResult } from "../ai/model";
import { hasTestDb, resetDb, testPrisma } from "../../test/db";
import { createConversationPipeline } from "./conversation";

const usage = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 3000, cache_creation_input_tokens: 0 };

/** Scripted model: returns the queued responses in order and records what it was sent. */
function fakeModel(queue: (FriendModelResult | Error)[]) {
  const calls: FriendModelInput[] = [];
  const model: FriendModel = {
    async respond(input) {
      calls.push(input);
      const next = queue.shift();
      if (!next) throw new Error("no scripted response");
      if (next instanceof Error) throw next;
      return next;
    },
    async complete() {
      return { text: "summary", usage };
    },
  };
  return { model, calls };
}

const ok = (output: Partial<FriendResponse> & { reply: string[] }): FriendModelResult => ({
  ok: true,
  usage,
  output: { create_items: [], update_items: [], save_memories: [], crisis: false, ...output },
});

describe.skipIf(!hasTestDb)("conversation pipeline", () => {
  const prisma = testPrisma();
  // Thursday 2026-11-19 12:00 in Cairo (UTC+2).
  const now = new Date("2026-11-19T10:00:00.000Z");
  const installId = randomUUID();
  const headers = { [INSTALL_ID_HEADER]: installId };

  beforeEach(() => resetDb(prisma));
  afterAll(() => prisma.$disconnect());

  function appWith(model: FriendModel) {
    return buildApp({ logger: false }, { prisma, now: () => now, pipeline: createConversationPipeline({ model }) });
  }
  const send = async (app: ReturnType<typeof appWith>, text: string, clientId: string = randomUUID()) => {
    const res = await app.inject({
      method: "POST",
      url: "/messages",
      headers,
      payload: { client_id: clientId, text, created_at: now.toISOString(), timezone: "Africa/Cairo" },
    });
    return { status: res.statusCode, body: PostMessageResponse.parse(res.json()) };
  };

  it("replies in the persona and saves items + memories (the PRD dentist example)", async () => {
    const { model, calls } = fakeModel([
      ok({
        reply: ["Ahmed and his 500s 😂 Noted.", "Dentist Sunday at 6, I'll ping you at 5. Same clinic in Dokki?"],
        create_items: [
          { type: "reminder", title: "Dentist", due_at_local: "2026-11-22T18:00", remind_at_local: "2026-11-22T17:00", follow_up_at_local: "2026-11-22T20:00" },
          { type: "debt", title: "Ahmed borrowed 500", debt: { person: "Ahmed", amount: 500, direction: "owed_to_me" } },
        ],
        save_memories: [{ kind: "person", subject: "Ahmed", content: "Often borrows money from the user" }],
      }),
    ]);
    const app = appWith(model);
    const { status, body } = await send(app, "ya3ni Ahmed borrowed 500 again and I have the dentist Sunday at 6, ugh");
    expect(status).toBe(201);
    expect(body.replies.map((r) => r.text)).toHaveLength(2);
    expect(body.replies.every((r) => r.role === "friend")).toBe(true);

    const dentist = body.items.find((i) => i.title === "Dentist")!;
    expect(dentist.due_at).toBe("2026-11-22T16:00:00.000Z"); // 18:00 Cairo
    expect(dentist.remind_at).toBe("2026-11-22T15:00:00.000Z");
    expect(dentist.follow_up_at).toBe("2026-11-22T18:00:00.000Z");
    const debt = body.items.find((i) => i.type === "debt")!;
    expect(debt).toMatchObject({ debt_person: "Ahmed", debt_amount: 500, debt_direction: "owed_to_me" });
    expect(body.memories[0]).toMatchObject({ subject: "Ahmed", kind: "person" });

    // The model saw the persona, the local time, and the user's message as the last turn.
    expect(calls[0]!.system).toContain("You are Zaki");
    expect(calls[0]!.context).toContain("NOW: Thursday 2026-11-19 12:00 (Africa/Cairo)");
    expect(calls[0]!.history.at(-1)).toMatchObject({ role: "user" });

    // Cost is tracked per call without any message content.
    const ev = await prisma.event.findFirstOrThrow({ where: { name: "ai_call" } });
    expect(ev.propsJson).toMatchObject({ purpose: "chat", items_created: 2 });
    expect(JSON.stringify(ev.propsJson)).not.toContain("Ahmed");
    await app.close();
  });

  it("returns the same replies when a message is retried", async () => {
    const { model } = fakeModel([ok({ reply: ["Got it"] })]);
    const app = appWith(model);
    const id = randomUUID();
    await send(app, "remind me to call mom tomorrow", id);
    const again = await send(app, "remind me to call mom tomorrow", id);
    expect(again.status).toBe(200);
    expect(again.body.duplicate).toBe(true);
    expect(again.body.replies.map((r) => r.text)).toEqual(["Got it"]);
    await app.close();
  });

  it("feeds memories and open items back into later chats (FR-4)", async () => {
    const { model, calls } = fakeModel([
      ok({ reply: ["Noted"], create_items: [{ type: "task", title: "Call Hassan" }], save_memories: [{ kind: "person", subject: "Omar", content: "Her son; school bus paid on the 1st" }] }),
      ok({ reply: ["Nice!"] }),
    ]);
    const app = appWith(model);
    await send(app, "call Hassan sometime, and Omar's bus is due on the 1st");
    await send(app, "how's it going");
    expect(calls[1]!.context).toContain("Omar: Her son; school bus paid on the 1st");
    expect(calls[1]!.context).toMatch(/id=[0-9a-f-]{36} \| task \| "Call Hassan"/);
    expect(calls[1]!.history.map((h) => h.role)).toEqual(["user", "assistant", "user"]);
    await app.close();
  });

  it("marks items done only for the user's own items", async () => {
    const { model } = fakeModel([ok({ reply: ["Noted"], create_items: [{ type: "task", title: "Pay electricity" }] })]);
    const app = appWith(model);
    const first = await send(app, "pay the electricity");
    const itemId = first.body.items[0]!.id;
    const foreign = randomUUID();

    const { model: m2 } = fakeModel([ok({ reply: ["Bravo 👏"], update_items: [{ id: itemId, status: "done" }, { id: foreign, status: "done" }, { id: "not-a-uuid", status: "done" }] })]);
    const app2 = appWith(m2);
    const second = await send(app2, "paid it!");
    expect(second.body.items).toHaveLength(1);
    expect(second.body.items[0]).toMatchObject({ id: itemId, status: "done", done_at: now.toISOString() });
    await app.close();
    await app2.close();
  });

  it("closes an item when the user says yes to Zaki's status check, without the model", async () => {
    const { model, calls } = fakeModel([ok({ reply: ["ولا يهمك، أفكرك بكرة؟"] })]);
    const app = appWith(model);
    const user = await prisma.user.create({ data: { authId: `install:${installId}`, timezone: "Africa/Cairo" } });
    const item = await prisma.item.create({ data: { userId: user.id, type: "reminder", title: "call mum", remindAt: new Date(now.getTime() - 3 * 3600_000) } });
    await prisma.message.create({ data: { userId: user.id, role: "friend", kind: "followup", text: "عملت «call mum»؟ 🙂", clientId: `status:item:${item.id}:x`, createdAt: new Date(now.getTime() - 3600_000) } });

    const yes = await send(app, "اه خلصت");
    expect(yes.body.replies.map((r) => r.text)).toEqual(["برافو عليك! علّمت «call mum» إنها خلصت ✅"]);
    expect((await prisma.item.findUniqueOrThrow({ where: { id: item.id } })).status).toBe("done");
    expect(calls).toHaveLength(0);
  });

  it("lets any other answer to a status check go to the model", async () => {
    const { model, calls } = fakeModel([ok({ reply: ["ولا يهمك، أفكرك بكرة؟"] })]);
    const app = appWith(model);
    const user = await prisma.user.create({ data: { authId: `install:${installId}`, timezone: "Africa/Cairo" } });
    const tracker = await prisma.tracker.create({ data: { userId: user.id, kind: "water" } });
    await prisma.message.create({ data: { userId: user.id, role: "friend", kind: "followup", text: "شربت مية النهارده؟ 💧", clientId: `status:tracker:${tracker.id}:x`, createdAt: new Date(now.getTime() - 3600_000) } });

    await send(app, "لسه والله");
    expect(calls).toHaveLength(1);
    expect(await prisma.trackerEntry.count()).toBe(0);
    await send(app, "اه");
    expect(await prisma.trackerEntry.count()).toBe(0); // the latest friend message is now the model's reply
  });

  it("makes the reminder an alarm when the user asked for one, even if the model forgot", async () => {
    const { model } = fakeModel([
      ok({ reply: ["تمام، هصحيك ٦ الصبح ⏰"], create_items: [{ type: "reminder", title: "الصحيان", due_at_local: "2026-11-20T06:00", important: false, alarm: false }] }),
    ]);
    const app = appWith(model);
    const { body } = await send(app, "صحيني بكرة الساعة ٦ الصبح");
    expect(body.items[0]).toMatchObject({ title: "الصحيان", alarm: true });
    await app.close();
  });

  it("answers a retried message whose reply was lost (server restarted mid-reply)", async () => {
    const { model } = fakeModel([ok({ reply: ["أهو ده اللي عندك الأسبوع ده"] })]);
    const app = appWith(model);
    const first = await send(app, "hello");
    // The stored message as a restart would leave it: no reply rows.
    await prisma.message.deleteMany({ where: { clientId: { startsWith: `${first.body.message.client_id}:reply:` } } });
    const retry = await send(app, "hello", first.body.message.client_id);
    expect(retry.status).toBe(201);
    expect(retry.body.replies.length).toBeGreaterThan(0);
    await app.close();
  });

  it("answers thanks without calling the model", async () => {
    const { model, calls } = fakeModel([]);
    const app = appWith(model);
    const { body } = await send(app, "شكرا");
    expect(calls).toHaveLength(0);
    expect(body.replies).toHaveLength(1);
    await app.close();
  });

  it("always includes helpline info for crisis messages and creates no items", async () => {
    const { model } = fakeModel([
      ok({ reply: ["I'm really sorry you're feeling this way."], crisis: false, create_items: [{ type: "task", title: "should not be saved" }] }),
    ]);
    const app = appWith(model);
    const { body } = await send(app, "I want to kill myself");
    expect(body.replies.at(-1)!.text).toContain("16328");
    expect(body.items).toEqual([]);
    expect(await prisma.event.count({ where: { name: "crisis_flag" } })).toBe(1);
    await app.close();
  });

  it("still replies (and keeps the message) when the AI fails", async () => {
    const { model } = fakeModel([new Error("overloaded")]);
    const app = appWith(model);
    const { status, body } = await send(app, "ana 3ayez a2ollak 7aga");
    expect(status).toBe(201);
    expect(body.replies[0]!.text).toContain("معلش"); // Franco in, Arabic out
    expect(await prisma.message.count({ where: { role: "user" } })).toBe(1);
    await app.close();
  });

  it("ignores unparseable times from the model instead of failing", async () => {
    const { model } = fakeModel([ok({ reply: ["Ok"], create_items: [{ type: "reminder", title: "Gym", due_at_local: "2026-02-30T25:00" }] })]);
    const app = appWith(model);
    const { status, body } = await send(app, "gym later");
    expect(status).toBe(201);
    expect(body.items[0]!.due_at).toBeNull();
    await app.close();
  });

  it("never says a reminder is set when nothing was set: retries once, then tells the truth", async () => {
    const claim = ok({ reply: ["تمام، الساعة ٤ العصر بكرة، هفكرك تعزم خالد."] });
    // The retry fixes it: the reminder made from the first message moves to 4 PM.
    const first = fakeModel([
      ok({ reply: ["تمام، بكرة الساعة ٤ العصر كويس؟"], create_items: [{ type: "reminder", title: "اعزم خالد", due_at_local: "2026-11-20T09:00", remind_at_local: "2026-11-20T09:00" }] }),
      claim,
      ok({ reply: ["تمام، الساعة ٤ العصر بكرة، هفكرك."], update_items: [] }),
    ]);
    const app = appWith(first.model);
    const made = (await send(app, "فكرني بكره اعزم خالد على حاجة يشربها")).body.items[0]!;
    first.model.respond = (async (input) => {
      first.calls.push(input);
      return first.calls.length === 2 ? claim : ok({ reply: ["تمام، الساعة ٤ العصر بكرة، هفكرك."], update_items: [{ id: made.id, remind_at_local: "2026-11-20T16:00", due_at_local: "2026-11-20T16:00" }] });
    }) as FriendModel["respond"];
    const yes = await send(app, "ahh hlw el sa3a 4");
    expect(first.calls[2]!.context).toContain("CHECK:");
    expect(yes.body.items[0]).toMatchObject({ id: made.id, remind_at: "2026-11-20T14:00:00.000Z" });
    await app.close();

    // The retry still claims it, and nothing was set: an honest reply instead.
    await resetDb(prisma);
    const none = fakeModel([claim, claim]);
    const app2 = appWith(none.model);
    const res = await send(app2, "ahh hlw el sa3a 4");
    expect(res.body.replies.map((r) => r.text)).toEqual(["لسه ما ظبطتش التذكير ده. قولي اليوم والساعة بالظبط وأنا أظبطه على طول."]);
    expect(res.body.items).toEqual([]);
    await app2.close();
  });

  it("shows the reminder the user just confirmed when it was already set", async () => {
    const claim = ok({ reply: ["تمام، هفكرك بكرة الساعة ٤."] });
    const { model } = fakeModel([
      ok({ reply: ["بكرة الساعة ٤ العصر كويس؟"], create_items: [{ type: "reminder", title: "اعزم خالد", due_at_local: "2026-11-20T16:00", remind_at_local: "2026-11-20T16:00" }] }),
      claim,
      claim,
    ]);
    const app = appWith(model);
    const made = (await send(app, "فكرني بكره اعزم خالد")).body.items[0]!;
    const yes = await send(app, "تمام الساعة ٤");
    expect(yes.body.replies[0]!.text).toBe("تمام، هفكرك بكرة الساعة ٤.");
    expect(yes.body.items.map((i) => i.id)).toEqual([made.id]);
    await app.close();
  });
});

describe.skipIf(!hasTestDb)("conversation pipeline: phone brain", () => {
  const prisma = testPrisma();
  const now = new Date("2026-11-19T10:00:00.000Z");
  const headers = { [INSTALL_ID_HEADER]: randomUUID() };
  beforeEach(() => resetDb(prisma));
  afterAll(() => prisma.$disconnect());

  it("decides in code, asks the phone only for the reply, with no cloud call and no allowance used", async () => {
    const { model, calls } = fakeModel([]);
    const app = buildApp({ logger: false }, { prisma, now: () => now, pipeline: createConversationPipeline({ model }), billing: { requireSubscription: true } });
    const clientId = randomUUID();
    const payload = { client_id: clientId, text: "fakarny bokra el sa3a 6 el dentist", created_at: now.toISOString(), timezone: "Africa/Cairo", brain: "phone" };
    const first = await app.inject({ method: "POST", url: "/messages", headers, payload });
    expect(first.statusCode).toBe(202);
    const need = first.json().needs_brain;
    // The code already read the message: the phone's model is told what was done.
    expect(need.context).toContain("DONE:");
    expect(need.context).toContain("tomorrow at 6pm");
    expect(need.schema).toMatchObject({ required: ["reply", "crisis"] });
    expect(need.history.at(-1)).toEqual({ role: "user", text: payload.text });
    expect(need.system).toContain("# WELLBEING");

    // Anything but the reply is ignored: the model can't add or change a reminder.
    const output = { reply: ["تمام، هفكرك بكرة الساعة ٦"], items: [{ type: "reminder", title: "حاجة غلط", when: "2026-11-21T09:00" }], crisis: false };
    const second = await app.inject({ method: "POST", url: "/messages", headers, payload: { ...payload, phone_output: output, phone_model: "test" } });
    expect(second.statusCode).toBe(201);
    const body = PostMessageResponse.parse(second.json());
    expect(body.replies.map((r) => r.text)).toEqual(output.reply);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ title: "دكتور السنان", due_at: "2026-11-20T16:00:00.000Z" });
    expect(calls).toHaveLength(0);
    // On the phone: free, no allowance (pricing undecided).
    expect(body.ai_allowance?.limit ?? null).toBeNull();
    const ev = await prisma.event.findFirst({ where: { name: "ai_call" } });
    expect(ev?.propsJson).toMatchObject({ purpose: "phone", valid: true });

    // A retry returns what was stored.
    const again = await app.inject({ method: "POST", url: "/messages", headers, payload: { ...payload, phone_output: output } });
    expect(PostMessageResponse.parse(again.json()).duplicate).toBe(true);
  });

  it("never lets the phone model claim an unset reminder", async () => {
    const { model } = fakeModel([]);
    const app = buildApp({ logger: false }, { prisma, now: () => now, pipeline: createConversationPipeline({ model }) });
    const payload = { client_id: randomUUID(), text: "so tired today", created_at: now.toISOString(), timezone: "Africa/Cairo", brain: "phone", phone_output: { reply: ["Done, I'll remind you at 6!"], crisis: false } };
    const res = await app.inject({ method: "POST", url: "/messages", headers, payload });
    const body = PostMessageResponse.parse(res.json());
    expect(body.replies[0]!.text).not.toContain("remind you at 6");
    expect(body.items).toHaveLength(0);
  });

  it("answers in code's own words when the phone model gives nothing usable", async () => {
    const { model } = fakeModel([]);
    const app = buildApp({ logger: false }, { prisma, now: () => now, pipeline: createConversationPipeline({ model }) });
    const payload = { client_id: randomUUID(), text: "remind me to call mom at 6", created_at: now.toISOString(), timezone: "Africa/Cairo", brain: "phone", phone_output: { nonsense: true } };
    const res = await app.inject({ method: "POST", url: "/messages", headers, payload });
    const body = PostMessageResponse.parse(res.json());
    expect(body.items[0]).toMatchObject({ due_at: "2026-11-19T16:00:00.000Z" });
    expect(body.replies[0]!.text).toContain("today at 6pm");
  });

  it("asks for the missing time instead of guessing", async () => {
    const { model } = fakeModel([]);
    const app = buildApp({ logger: false }, { prisma, now: () => now, pipeline: createConversationPipeline({ model }) });
    const payload = { client_id: randomUUID(), text: "فكرني أكلم خالد", created_at: now.toISOString(), timezone: "Africa/Cairo", brain: "phone" };
    const first = await app.inject({ method: "POST", url: "/messages", headers, payload });
    expect(first.json().needs_brain.context).toContain("ASK: what time");
    const res = await app.inject({ method: "POST", url: "/messages", headers, payload: { ...payload, phone_output: { reply: ["أكيد، أفكرك إمتى؟"], crisis: false } } });
    const body = PostMessageResponse.parse(res.json());
    expect(body.items).toHaveLength(0);
    expect(body.replies[0]!.text).toBe("أكيد، أفكرك إمتى؟");
  });

  it("keeps the crisis safety net for the phone model", async () => {
    const { model } = fakeModel([]);
    const app = buildApp({ logger: false }, { prisma, now: () => now, pipeline: createConversationPipeline({ model }) });
    const payload = { client_id: randomUUID(), text: "I want to die", created_at: now.toISOString(), timezone: "Africa/Cairo", brain: "phone", phone_output: { reply: ["I'm here with you."], crisis: false } };
    const res = await app.inject({ method: "POST", url: "/messages", headers, payload });
    const body = PostMessageResponse.parse(res.json());
    expect(body.replies.map((r) => r.text).join(" ")).toContain("16328");
  });
});
