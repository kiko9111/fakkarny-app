import { afterEach, describe, expect, it } from "vitest";
import { pause, refuse, RESPOND, startStandIn, streamed, whole, type Answer, type Asked } from "../../test/anthropic-standin";
import { createAnthropicModel, type FriendModelInput } from "./model";

/**
 * The model layer against a stand-in for the Messages API over a real socket, so the SDK's own
 * streaming code runs: what is asked for (a stream or not, the eager flag), what is passed on
 * while the turn is written, and what happens when a stream is refused, cut off or too slow.
 */

let standIn: Awaited<ReturnType<typeof startStandIn>> | null = null;
afterEach(async () => {
  await standIn?.close();
  standIn = null;
});

async function api(answer: (asked: Asked, n: number) => Answer) {
  standIn = await startStandIn(answer);
  const { asked, baseURL } = standIn;
  return { asked, model: (opts: { streamTimeoutMs?: number } = {}) => createAnthropicModel({ apiKey: "test", baseURL, ...opts }) };
}

const input: FriendModelInput = { system: "You are Zaki.", context: "NOW: Thu 2026-11-19 10:00", history: [{ role: "user", text: "صباح الخير" }], requireArabic: true };

function watch() {
  const log: string[] = [];
  const bubbles: string[] = [];
  return {
    log,
    bubbles,
    live: {
      onReply: (bubble: number, delta: string) => {
        bubbles[bubble] = (bubbles[bubble] ?? "") + delta;
        log.push("words");
      },
      onReplyEnd: () => void log.push("end"),
      onRestart: () => void log.push("restart"),
    },
  };
}

describe("a chat turn read while it is written", () => {
  it("passes the reply on piece by piece and returns the same answer", async () => {
    const { asked, model } = await api(() => streamed());
    const w = watch();
    const out = await model().respond(input, w.live);
    expect(out).toMatchObject({ ok: true, stream: "eager", output: { reply: RESPOND.reply }, usage: { input_tokens: 100, output_tokens: 30 } });
    expect(w.bubbles).toEqual(RESPOND.reply);
    // In more than one piece, and the end of the reply is told once, before the turn is done.
    expect(w.log.filter((l) => l === "words").length).toBeGreaterThan(3);
    expect(w.log.filter((l) => l === "end")).toHaveLength(1);
    expect(w.log).not.toContain("restart");
    expect(out.ok && out.streamLost).toBeUndefined();
    // Asked for as a stream, the eager flag on `respond` only.
    expect(asked).toHaveLength(1);
    expect(asked[0]!.stream).toBe(true);
    expect(asked[0]!.eager[0]).toBe(true);
    expect(asked[0]!.eager.slice(1).some(Boolean)).toBe(false);
  });

  it("asks exactly as before when nobody reads along", async () => {
    const { asked, model } = await api(() => whole);
    const out = await model().respond(input);
    expect(out).toMatchObject({ ok: true, output: { reply: RESPOND.reply } });
    expect(out.ok && out.stream).toBeUndefined();
    expect(asked).toEqual([{ stream: false, eager: asked[0]!.eager.map(() => false) }]);
  });

  it("steps down for good when the API refuses the stream", async () => {
    // Refuses the eager flag, then any stream at all.
    const { asked, model } = await api((a) => (a.eager[0] ? refuse(400) : a.stream ? streamed() : whole));
    const m = model();
    const first = watch();
    const one = await m.respond(input, first.live);
    // Refused before it began: nothing of it was paid for, and the turn says why it came whole.
    expect(one).toMatchObject({ ok: true, output: { reply: RESPOND.reply }, streamLost: "refused", usage: { input_tokens: 100, output_tokens: 30 } });
    expect(one.ok && one.stream).toBeUndefined();
    expect(first.log).toEqual(["restart"]);
    expect(asked.map((a) => [a.stream, a.eager[0]])).toEqual([
      [true, true],
      [false, false],
    ]);

    // The next turn: still a stream, without the flag.
    const second = watch();
    expect(await m.respond(input, second.live)).toMatchObject({ ok: true, stream: "plain" });
    expect(asked[2]).toMatchObject({ stream: true });
    expect(asked[2]!.eager[0]).toBe(false);
    expect(second.bubbles).toEqual(RESPOND.reply);
  });

  it("stops asking for a stream when every stream is refused", async () => {
    const { asked, model } = await api((a) => (a.stream ? refuse(400) : whole));
    const m = model();
    expect(m.streams).toBe(true);
    for (let n = 0; n < 3; n++) expect(await m.respond(input, watch().live)).toMatchObject({ ok: true });
    // eager refused, plain refused, then no stream is asked for at all.
    expect(asked.map((a) => a.stream)).toEqual([true, false, true, false, false]);
    // And the server stops telling phones to ask for one (app.ts `liveReplies`).
    expect(m.streams).toBe(false);
  });

  it("asks again without a stream when the stream is cut off", async () => {
    const { asked, model } = await api((a) => (a.stream ? streamed({ upTo: 6, then: (res) => res.destroy() }) : whole));
    const m = model();
    const w = watch();
    const out = await m.respond(input, w.live);
    // What the lost stream had read is counted with the plain request that answered (its own
    // writing is not known: the API tells that at the end of a stream).
    expect(out).toMatchObject({ ok: true, output: { reply: RESPOND.reply }, streamLost: "cut", usage: { input_tokens: 200, output_tokens: 31 } });
    expect(out.ok && out.stream).toBeUndefined();
    // Some words were shown, then taken back.
    expect(w.log.at(-1)).toBe("restart");
    expect(w.log).toContain("words");
    expect(asked.map((a) => a.stream)).toEqual([true, false]);

    // Once is not the API's refusal, and not a pattern: the next turn is a stream again.
    expect(await m.respond(input, watch().live)).toMatchObject({ ok: true });
    expect(asked.map((a) => a.stream)).toEqual([true, false, true, false]);
    // Twice in a row is: streams pause, and the turn is asked for whole straight away.
    const third = watch();
    expect(await m.respond(input, third.live)).toMatchObject({ ok: true, output: { reply: RESPOND.reply } });
    expect(asked.map((a) => a.stream)).toEqual([true, false, true, false, false]);
    expect(third.log).toEqual([]);
    // While they pause, phones are not told to ask.
    expect(m.streams).toBe(false);
  });

  it("forgets a broken stream once one works", async () => {
    let cut = true;
    const { asked, model } = await api((a) => (a.stream ? (cut ? streamed({ upTo: 6, then: (res) => res.destroy() }) : streamed()) : whole));
    const m = model();
    await m.respond(input, watch().live);
    cut = false;
    expect(await m.respond(input, watch().live)).toMatchObject({ ok: true, stream: "eager" });
    cut = true;
    await m.respond(input, watch().live);
    // One broken, one good, one broken: never two in a row, so the fourth is still a stream.
    cut = false;
    expect(await m.respond(input, watch().live)).toMatchObject({ ok: true, stream: "eager" });
    expect(asked.map((a) => a.stream)).toEqual([true, false, true, true, false, true]);
  });

  it("stops a stream that takes too long", async () => {
    const { asked, model } = await api((a) => (a.stream ? streamed({ upTo: 4, then: () => pause(5_000) }) : whole));
    const w = watch();
    const started = Date.now();
    const out = await model({ streamTimeoutMs: 150 }).respond(input, w.live);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(out).toMatchObject({ ok: true, output: { reply: RESPOND.reply }, streamLost: "timeout", usage: { input_tokens: 200 } });
    expect(w.log.at(-1)).toBe("restart");
    expect(asked.map((a) => a.stream)).toEqual([true, false]);
  });

  it("passes an outage through, as before", async () => {
    const { model } = await api(() => refuse(529));
    const w = watch();
    await expect(model().respond(input, w.live)).rejects.toMatchObject({ status: 529 });
    expect(w.log).toEqual(["restart"]);
  }, 15_000);
});
