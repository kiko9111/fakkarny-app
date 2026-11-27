import { describe, expect, it } from "vitest";
import { readGameyaMessage } from "./match";

describe("readGameyaMessage", () => {
  it.each([
    ["دفعت الجمعية", "paid"],
    ["دفعت قسط الجمعية بتاعتي", "paid"],
    ["خلاص دفعت الجمعية النهارده", "paid"],
    ["dafa3t el gam3eya", "paid"],
    ["I paid the gam'eya", "paid"],
    ["الجمعية الدور على مين؟", "status"],
    ["امتى دوري في الجمعية", "status"],
    ["مين دفع الجمعية", "status"],
    ["whose turn is it in the gameya", "status"],
    ["dor meen fel gam3eya", "status"],
    ["عايز اعمل جمعية", "new"],
    ["start a gam'eya", "new"],
  ])("%s → %s", (text, kind) => {
    expect(readGameyaMessage(text)?.kind).toBe(kind);
  });

  it.each([
    "نازل الجمعية أجيب سكر",
    "دفعت 300 في الجمعية",
    "لسه مدفعتش الجمعية",
    "I didn't pay the gam'eya yet",
    "جمعة مباركة",
    "دفعت الإيجار",
    "اعمل ايه في الجمعية؟",
  ])("not a gam'eya action: %s", (text) => {
    expect(readGameyaMessage(text)?.kind === "paid" || readGameyaMessage(text)?.kind === "new").toBe(false);
  });

  it("keeps a name hint", () => {
    expect(readGameyaMessage("دفعت جمعية الشغل")).toEqual({ kind: "paid", hint: "الشغل" });
  });
});
