import { describe, expect, it } from "vitest";
import { isMomentTime, isSensitive, momentLines, momentPrompt, pickMemory } from "./memory-moment";

const now = new Date("2026-11-23T15:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
const mem = (over: Partial<Parameters<typeof pickMemory>[0][number]>) => ({ id: "m", kind: "preference", subject: "walking", content: "wants to start walking every morning", createdAt: daysAgo(30), lastUsedAt: null, ...over });

describe("memory moments", () => {
  it("picks an old, unused, gentle memory, the longest unused first", () => {
    expect(pickMemory([mem({ id: "new", createdAt: daysAgo(3) })], now)).toBeNull();
    expect(pickMemory([mem({ id: "old", createdAt: daysAgo(200) })], now)).toBeNull();
    expect(pickMemory([mem({ id: "used", lastUsedAt: daysAgo(5) })], now)).toBeNull();
    expect(pickMemory([mem({ id: "place", kind: "place" })], now)).toBeNull();
    expect(pickMemory([mem({ id: "a", createdAt: daysAgo(20) }), mem({ id: "b", createdAt: daysAgo(60) })], now)?.id).toBe("b");
  });
  it("never picks sensitive things", () => {
    expect(isSensitive({ subject: "بابا", content: "عنده سرطان" })).toBe(true);
    expect(isSensitive({ subject: "Sara", content: "got divorced last year" })).toBe(true);
    expect(isSensitive({ subject: "عمر", content: "ابنه في سنة رابعة" })).toBe(false);
    expect(pickMemory([mem({ content: "her mother passed away in March" })], now)).toBeNull();
  });
  it("runs late afternoon and reads the model's answer strictly", () => {
    expect(isMomentTime("2026-11-23T16:30")).toBe(true);
    expect(isMomentTime("2026-11-23T19:00")).toBe(false);
    expect(momentLines("SKIP")).toBeNull();
    expect(momentLines("- one\n- two")).toBeNull();
    expect(momentLines("فاكر لما قلتلي عايز تبدأ تمشي؟\nأتابعها معاك؟\nextra")).toEqual(["فاكر لما قلتلي عايز تبدأ تمشي؟", "أتابعها معاك؟"]);
    expect(momentPrompt(mem({}), now, { name: null, script: "english" })).toContain("about 4 weeks ago");
  });
});
