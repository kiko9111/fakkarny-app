import { describe, expect, it } from "vitest";
import { canCancel, canNudge, canRespond, canSettle, confirmShareText, flip, formatAmount, nudgeShareText, updateLine } from "./rules";

describe("daftar rules", () => {
  it("formats money and flips direction", () => {
    expect(formatAmount(1200, "EGP", "ar")).toBe("1,200 جنيه");
    expect(formatAmount(200.5, "EGP", "en")).toBe("EGP 200.5");
    expect(formatAmount(50, "USD", "ar")).toBe("50 USD");
    expect(flip("owed_to_me")).toBe("i_owe");
    expect(flip("i_owe")).toBe("owed_to_me");
  });
  it("allows the right next step for each side", () => {
    expect(canRespond("pending", "other")).toBe(true);
    expect(canRespond("pending", "creator")).toBe(false);
    expect(canRespond("confirmed", "other")).toBe(false);
    expect(canSettle("confirmed")).toBe(true);
    expect(canSettle("disputed")).toBe(false);
    expect(canCancel("pending", "creator")).toBe(true);
    expect(canCancel("confirmed", "creator")).toBe(false);
    expect(canCancel("pending", "other")).toBe(false);
    // Zaki nudges the other person only after they confirmed, and only for money owed to the creator.
    expect(canNudge("confirmed", "creator", "owed_to_me")).toBe(true);
    expect(canNudge("pending", "creator", "owed_to_me")).toBe(false);
    expect(canNudge("confirmed", "creator", "i_owe")).toBe(false);
    expect(canNudge("confirmed", "other", "owed_to_me")).toBe(false);
  });
  it("writes friendly messages that end with the link and never demand", () => {
    const base = { amount: 200, currency: "EGP", note: "العشا", url: "https://x/d/ABCD2345" };
    const ar = confirmShareText({ ...base, lang: "ar", direction: "owed_to_me" });
    expect(ar).toContain("200 جنيه");
    expect(ar).toContain("(العشا)");
    expect(ar.endsWith(base.url)).toBe(true);
    expect(confirmShareText({ ...base, lang: "ar", direction: "i_owe" })).toContain("ليك عندي");
    expect(confirmShareText({ ...base, lang: "en", direction: "i_owe", note: null })).toContain("the EGP 200 I owe you on Zaki");
    const nudge = nudgeShareText({ ...base, lang: "ar", direction: "owed_to_me" });
    expect(nudge).toContain("من غير أي ضغط");
    expect(nudge).not.toMatch(/ادفع|لازم/);
    expect(updateLine("ar", "confirmed", "أحمد", 200, "EGP")).toContain("أحمد أكّد الـ200 جنيه");
    expect(updateLine("en", "settled", "Ahmed", 200, "EGP")).toContain("settled");
  });
});
