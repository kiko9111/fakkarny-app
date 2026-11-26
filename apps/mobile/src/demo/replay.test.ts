import { describe, expect, it } from "vitest";
import { repliesOf, replayReply, replaySteps } from "./replay";

const heard = () => {
  const bubbles: string[] = [];
  return { bubbles, live: { onDraft: (i: number, d: string) => void (bubbles[i] = (bubbles[i] ?? "") + d), onReset: () => {} } };
};

describe("a sample answer shown as it would be written", () => {
  it("shows every word once, in order, bubble by bubble", () => {
    const replies = ["أهلا يا منى 💛", "عاملة إيه النهارده؟ يومك ماشي إزاي"];
    const steps = replaySteps(replies);
    expect(steps.length).toBeGreaterThan(replies.length);
    const out: string[] = [];
    for (const s of steps) out[s.bubble] = (out[s.bubble] ?? "") + s.delta;
    expect(out).toEqual(replies);
    // Never back to an earlier bubble.
    expect(steps.map((s) => s.bubble)).toEqual([...steps.map((s) => s.bubble)].sort((a, b) => a - b));
  });

  it("takes about as many steps for a long answer as for a short one", () => {
    const long = Array.from({ length: 400 }, (_, n) => `word${n}`).join(" ");
    const steps = replaySteps([long], 36);
    expect(steps.length).toBeLessThanOrEqual(36);
    expect(steps.map((s) => s.delta).join("")).toBe(long);
  });

  it("shows three bubbles at most and nothing for an empty answer", () => {
    expect(new Set(replaySteps(["a b", "c d", "e f", "g h"]).map((s) => s.bubble))).toEqual(new Set([0, 1, 2]));
    expect(replaySteps([])).toEqual([]);
    expect(replaySteps(["", "   "])).toEqual([]);
  });

  it("reads the bubbles out of an answer and of nothing else", () => {
    // Each bubble keeps its place, so a draft sits where its stored reply will.
    expect(repliesOf({ message: {}, replies: [{ text: "one" }, { text: 3 }, null, { text: "two" }] })).toEqual(["one", "", "", "two"]);
    expect(repliesOf(null)).toEqual([]);
    expect(repliesOf({ replies: "no" })).toEqual([]);
    expect(repliesOf({ status: "needs_brain" })).toEqual([]);
  });

  it("hands the words on with a pause between steps", async () => {
    const h = heard();
    const waits: number[] = [];
    await replayReply({ replies: [{ text: "صباح الخير يا منى" }, { text: "يومك عامل إيه؟" }] }, h.live, async (ms) => void waits.push(ms), 20);
    expect(h.bubbles).toEqual(["صباح الخير يا منى", "يومك عامل إيه؟"]);
    expect(waits.length).toBeGreaterThan(2);
    expect(new Set(waits)).toEqual(new Set([20]));
  });
});
