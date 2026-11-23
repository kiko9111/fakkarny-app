import { describe, expect, it } from "vitest";
import { checkupLines, hasSomething, isCheckupTime } from "./checkup";

const empty = { done: 0, overdue: 0, upcoming: 0, owedToMe: 0, iOwe: 0, trackerDays: 0, trackerName: null };

describe("Friday check-up", () => {
  it("runs on Friday late morning only", () => {
    expect(isCheckupTime("2026-11-27T11:00")).toBe(true); // Friday
    expect(isCheckupTime("2026-11-27T13:59")).toBe(true);
    expect(isCheckupTime("2026-11-27T10:59")).toBe(false);
    expect(isCheckupTime("2026-11-27T14:00")).toBe(false);
    expect(isCheckupTime("2026-11-26T12:00")).toBe(false); // Thursday
  });
  it("says only what is true and always ends with one question", () => {
    expect(hasSomething(empty)).toBe(false);
    const lines = checkupLines("arabic", { ...empty, done: 5, overdue: 1, trackerDays: 4, trackerName: "المية" });
    expect(lines[0]).toContain("مراجعة الجمعة");
    expect(lines.join("\n")).toContain("خلصت 5 حاجات");
    expect(lines.join("\n")).toContain("«المية»: 4 من ٧");
    expect(lines.join("\n")).toContain("نخلصها ولا نأجلها");
    expect(lines.join("\n")).not.toContain("الدفتر");
    expect(lines.at(-1)).toContain("أهم حاجة");
    const en = checkupLines("english", { ...empty, upcoming: 1, owedToMe: 2 });
    expect(en).toEqual([
      "🌿 Friday check-up: your week in a minute",
      "Next week you have 1 thing lined up, and I'll remind you.",
      "2 people owe you in the Daftar.",
      "What's the one thing you most want to get done next week? Tell me and I'll remind you 💛",
    ]);
  });
});
