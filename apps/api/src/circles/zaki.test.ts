import { describe, expect, it } from "vitest";
import { addressesZaki, circleReminderLine, parseZakiAsk, zakiCommentLine } from "./zaki";

describe("@Zaki in a circle", () => {
  it("only answers when addressed", () => {
    expect(addressesZaki("@زكي فكّر الكل")).toBe(true);
    expect(addressesZaki("Zaki, remind everyone")).toBe(true);
    expect(addressesZaki("برافو يا عمر")).toBe(false);
  });
  it("reads a reminder for everyone, keeping the member's words", () => {
    expect(parseZakiAsk("زكي فكّر الكل بغدا الجمعة")).toEqual({ kind: "remind", what: "غدا الجمعة" });
    expect(parseZakiAsk("@Zaki remind everyone about Friday lunch")).toEqual({ kind: "remind", what: "Friday lunch" });
    expect(parseZakiAsk("زكي فكّر")).toEqual({ kind: "help" });
  });
  it("reads summary and check-in asks, else explains", () => {
    expect(parseZakiAsk("زكي ملخص الأسبوع")).toEqual({ kind: "summary" });
    expect(parseZakiAsk("Zaki is everyone ok?")).toEqual({ kind: "checkin" });
    expect(parseZakiAsk("زكي احكيلي نكتة")).toEqual({ kind: "help" });
  });
  it("writes Zaki's answers per reader language", () => {
    expect(zakiCommentLine("ar", "zaki:reminded|3")).toBe("تمام، فكّرت 3 في الدايرة في الشات بتاعهم 💛");
    expect(zakiCommentLine("en", "zaki:summary|" + JSON.stringify({ done: ["Omar", "Omar"], open: 1, checkins: 0 }))).toContain("Omar finished the most (2)");
    expect(zakiCommentLine("ar", "zaki:unknown")).toBeNull();
    expect(circleReminderLine("ar", "ماما", "البيت", "غدا الجمعة")).toBe("تذكير من ماما في «البيت»: غدا الجمعة 💛");
  });
});
