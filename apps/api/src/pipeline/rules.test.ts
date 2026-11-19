import { describe, expect, it } from "vitest";
import { toFriendResponse, type ModelOutput } from "../ai/model";
import { detectScript, fastReply, looksLikeCrisis } from "./rules";
import { rankMemories } from "./context";

describe("detectScript", () => {
  it.each([
    ["عندي دكتور الأسنان الأحد الساعة ٦", "arabic"],
    ["ya3ni Ahmed borrowed 500 again", "franco"],
    ["ana 3ayez afakar el electricity", "franco"],
    ["Send the report to the manager before 2", "english"],
  ])("%s → %s", (text, script) => expect(detectScript(text)).toBe(script));
});

describe("fastReply", () => {
  it("answers thanks and lone emojis without AI", () => {
    expect(fastReply("شكراً", "arabic", () => 0)).toBe("العفو يا جميل 😊");
    expect(fastReply("Thanks!", "english", () => 0)).toBe("Anytime 😊");
    expect(fastReply("shokran", "franco", () => 0)).toBe("El 3afw 😊");
    expect(fastReply("😂😂", "english", () => 0)).toBe("😄");
  });

  it("sends anything that could hold a plan to the model", () => {
    expect(fastReply("thanks, and remind me to call mom tomorrow", "english")).toBeNull();
    expect(fastReply("ok", "english")).toBeNull(); // might answer the friend's question
    expect(fastReply("Dentist Sunday at 6", "english")).toBeNull();
  });
});

describe("looksLikeCrisis", () => {
  it.each(["I want to kill myself", "عايز اموت", "3ayez amoot", "thinking about suicide"])("flags %s", (t) =>
    expect(looksLikeCrisis(t)).toBe(true),
  );
  it.each(["this traffic is killing me", "I'm dying to see the match", "الدنيا زحمة موت"])("does not flag %s", (t) =>
    expect(looksLikeCrisis(t)).toBe(false),
  );
});

describe("toFriendResponse", () => {
  const base: ModelOutput = { reply: ["Hi"], create_items: [], update_items: [], save_memories: [], crisis: false };

  it("drops nulls so optional fields validate", () => {
    const r = toFriendResponse({
      ...base,
      create_items: [{ type: "task", title: "Call mom", due_at_local: null, remind_at_local: null, follow_up_at_local: null, important: false, debt: null }],
    });
    expect(r.create_items[0]).toEqual({ type: "task", title: "Call mom", important: false });
  });

  it("rejects bad local dates and over-long replies", () => {
    expect(() =>
      toFriendResponse({
        ...base,
        create_items: [{ type: "reminder", title: "x", due_at_local: "tomorrow 6pm", remind_at_local: null, follow_up_at_local: null, important: false, debt: null }],
      }),
    ).toThrow();
    expect(() => toFriendResponse({ ...base, reply: ["a", "b", "c", "d"] })).toThrow();
  });

  it("trims and drops empty reply strings", () => {
    expect(toFriendResponse({ ...base, reply: ["  hey  ", " "] }).reply).toEqual(["hey"]);
  });
});

describe("rankMemories", () => {
  const mk = (subject: string, created: string) =>
    ({ id: subject, userId: "u", kind: "person", subject, content: "-", lastUsedAt: null, createdAt: new Date(created) }) as const;
  it("puts memories mentioned in the chat first, then the newest", () => {
    const ranked = rankMemories([mk("Omar", "2026-01-01"), mk("Ahmed", "2026-01-02"), mk("Dokki", "2026-03-01")], "did ahmed pay?", 2);
    expect(ranked.map((m) => m.subject)).toEqual(["Ahmed", "Dokki"]);
  });
});
