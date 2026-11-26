import { describe, expect, it } from "vitest";
import { createReplyReader } from "./reply-stream";

/** Feed `pieces` and collect what each bubble was given. */
function read(pieces: string[]) {
  const bubbles: string[] = [];
  const calls: [number, string][] = [];
  const reader = createReplyReader((i, delta) => {
    calls.push([i, delta]);
    bubbles[i] = (bubbles[i] ?? "") + delta;
  });
  for (const p of pieces) reader.feed(p);
  return { bubbles, calls, finished: reader.finished };
}

const respond = (reply: unknown, rest: Record<string, unknown> = { create_items: [], update_items: [], save_memories: [], crisis: false }) => JSON.stringify({ reply, ...rest });

describe("createReplyReader", () => {
  it("reads the reply bubbles from a complete input", () => {
    const out = read([respond(["تمام يا منى 💛", "هفكرك بكرة الساعة ٧"])]);
    expect(out.bubbles).toEqual(["تمام يا منى 💛", "هفكرك بكرة الساعة ٧"]);
    expect(out.finished).toBe(true);
  });

  it("gives the same text however the input is cut", () => {
    const samples = [
      respond(["Hello there", "second one"]),
      respond(['He said "yes" \\ and left/', "tab\there\nnew line"]),
      respond(["قلب 💛 و نجمة 🌟", "😀😀"]),
      // The emoji written as escapes, the way a model sometimes does.
      '{"reply":["heart \\ud83d\\udc9b ok","a\\u0627b"],"create_items":[],"crisis":false}',
      respond([]),
      respond(["one"], { create_items: [{ type: "note", title: 'has "reply": ["no"] inside', due_at_local: null }], crisis: false }),
      '{ "reply" : [ "spaced" , "out" ] , "crisis" : false }',
    ];
    for (const text of samples) {
      const want = (JSON.parse(text) as { reply: string[] }).reply;
      // Two pieces, cut at every position.
      for (let cut = 0; cut <= text.length; cut++) {
        expect(read([text.slice(0, cut), text.slice(cut)]).bubbles, `cut at ${cut} of ${text}`).toEqual(want);
      }
      // One character at a time.
      expect(read([...text].flatMap((ch) => ch.split(""))).bubbles).toEqual(want);
      expect(read(text.split("")).bubbles).toEqual(want);
    }
  });

  it("reports each piece's new characters as they arrive", () => {
    const out = read(['{"reply":["Hel', "lo", ' there","Se', 'cond"],"crisis":false}']);
    expect(out.calls).toEqual([
      [0, "Hel"],
      [0, "lo"],
      [0, " there"],
      [1, "Se"],
      [1, "cond"],
    ]);
  });

  /** No half of an emoji on its own (a lone surrogate). */
  const whole = (s: string) => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);

  it("never shows half an emoji", () => {
    const heart = "💛";
    const text = respond([`a${heart}b`]);
    const at = text.indexOf(heart) + 1; // between the two halves
    const out = read([text.slice(0, at), text.slice(at)]);
    for (const [, delta] of out.calls) expect(whole(delta)).toBe(true);
    expect(out.bubbles).toEqual([`a${heart}b`]);

    const escaped = read(['{"reply":["a\\ud83d', '\\udc9bb"]}']);
    for (const [, delta] of escaped.calls) expect(whole(delta)).toBe(true);
    expect(escaped.bubbles).toEqual([`a${heart}b`]);
  });

  it("finds the reply when another field comes first", () => {
    const text = JSON.stringify({ crisis: false, create_items: [{ title: "x", list: ["a", "b"] }], reply: ["late but here"] });
    expect(read([text]).bubbles).toEqual(["late but here"]);
    expect(read(text.split("")).bubbles).toEqual(["late but here"]);
  });

  it("ignores a nested reply and stops quietly on anything unexpected", () => {
    expect(read([JSON.stringify({ wrapper: { reply: ["nested"] }, crisis: false })]).bubbles).toEqual([]);
    expect(read(['{"reply":"not an array"}']).bubbles).toEqual([]);
    expect(read(['{"reply":[1,2,3]}']).bubbles).toEqual([]);
    expect(read(['{"reply":["ok",5,"never"]}']).bubbles).toEqual(["ok"]);
    expect(read(["not json at all"]).bubbles).toEqual([]);
    expect(read(['{"reply":["bad \\uZZZZ escape"]}']).bubbles).toEqual(["bad "]);
    const done = read(['{"reply":["a"]', ',"reply":["again"]}']);
    expect(done.bubbles).toEqual(["a"]);
    expect(done.finished).toBe(true);
  });

  it("reports nothing after the array closes", () => {
    const out = read(['{"reply":["a"],"create_items":[{"title":"', 'later text"}]}']);
    expect(out.calls).toEqual([[0, "a"]]);
  });
});
