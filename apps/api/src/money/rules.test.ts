import { describe, expect, it } from "vitest";
import { balances, budgetCrossed, budgetLine, giftLines, matchMoneyLog, monthOf, monthRange, pickSection, previousMonth, settleUp, shareOf } from "./rules";

describe("money rules", () => {
  it("works in the user's local months", () => {
    expect(monthOf(new Date("2026-11-30T23:30:00Z"), "Africa/Cairo")).toBe("2026-12");
    expect(previousMonth("2027-01")).toBe("2026-12");
    const r = monthRange("2026-12", "Africa/Cairo");
    expect(r.from.toISOString()).toBe("2026-11-30T22:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-12-31T22:00:00.000Z");
  });

  it("splits evenly and settles with the fewest transfers", () => {
    const entries = [
      { payerId: "mama", amount: 300, split: ["mama", "omar", "sara"] },
      { payerId: "omar", amount: 60, split: ["mama", "omar", "sara"] },
    ];
    const bal = balances(entries);
    expect(bal.get("mama")).toBe(180);
    expect(bal.get("omar")).toBe(-60);
    expect(bal.get("sara")).toBe(-120);
    expect(settleUp(bal)).toEqual([
      { from: "sara", to: "mama", amount: 120 },
      { from: "omar", to: "mama", amount: 60 },
    ]);
    expect(shareOf(entries, "sara")).toBe(120);
  });

  it("warns once at 80% and once at the budget", () => {
    expect(budgetCrossed(700, 850, 1000)).toBe(80);
    expect(budgetCrossed(850, 900, 1000)).toBeNull();
    expect(budgetCrossed(900, 1000, 1000)).toBe(100);
    expect(budgetCrossed(100, 200, null)).toBeNull();
    expect(budgetLine("arabic", "العربية", 850, 1000, 80)).toBe("للعلم بس: «العربية» وصل 850 من 1,000 الشهر ده. فاضل 150 🌱");
  });

  it("reads amounts from chat, strictly", () => {
    expect(matchMoneyLog("دفعت 300 بنزين")).toEqual({ kind: "expense", amount: 300, note: "بنزين" });
    expect(matchMoneyLog("صرفت ٥٠ جنيه على الأكل")).toEqual({ kind: "expense", amount: 50, note: "الاكل" });
    expect(matchMoneyLog("قبضت 12 الف")).toEqual({ kind: "income", amount: 12000, note: null });
    expect(matchMoneyLog("spent 120 on groceries")).toEqual({ kind: "expense", amount: 120, note: "groceries" });
    // Debts, plans, questions and negations go to the model.
    expect(matchMoneyLog("دفعت لأحمد 200")).toBeNull();
    expect(matchMoneyLog("سلفت سارة 100")).toBeNull();
    expect(matchMoneyLog("هدفع 300 بكرة")).toBeNull();
    expect(matchMoneyLog("صرفت كام النهارده؟")).toBeNull();
    expect(matchMoneyLog("مدفعتش 300")).toBeNull();
    expect(matchMoneyLog("اشتريت اللحمة 200")).toEqual({ kind: "expense", amount: 200, note: null });
  });

  it("picks a section by its name, by memory, or when there is only one", () => {
    const sections = [
      { id: "car", name: "العربية", kind: "expense" },
      { id: "food", name: "أكل", kind: "expense" },
      { id: "pay", name: "المرتب", kind: "income" },
    ];
    expect(pickSection(sections, { kind: "expense", amount: 50, note: "اكل" }, "صرفت 50 أكل", null)?.id).toBe("food");
    expect(pickSection(sections, { kind: "expense", amount: 300, note: "بنزين" }, "دفعت 300 بنزين", "car")?.id).toBe("car");
    expect(pickSection(sections, { kind: "expense", amount: 300, note: "بنزين" }, "دفعت 300 بنزين", null)).toBeNull();
    expect(pickSection(sections, { kind: "income", amount: 9000, note: null }, "قبضت 9000", null)?.id).toBe("pay");
  });

  it("writes a warm month gift from the numbers only", () => {
    const lines = giftLines("arabic", { month: "2026-11", expense: 4000, income: 9000, sections: [{ name: "أكل", total: 2500, budget: 3000 }, { name: "العربية", total: 1500, budget: 1000 }], previousExpense: 5000 });
    expect(lines[0]).toBe("🎁 هدية آخر الشهر من زكي: ملخّص نوفمبر");
    expect(lines).toContain("يعني فضل معاك 5,000 🌟 برافو عليك!");
    expect(lines).toContain("أكبر قسم: «أكل» بـ2,500.");
    expect(lines).toContain("1 من 2 أقسام فضلت جوه الميزانية.");
    expect(lines).toContain("وصرفت أقل من الشهر اللي قبله بـ1,000 💪");
  });
});
