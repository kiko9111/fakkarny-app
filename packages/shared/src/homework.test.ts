import { describe, expect, it } from "vitest";
import { parseHomeworkMessage, pocketTotals } from "./homework";

// Thursday 2026-11-26.
const TODAY = "2026-11-26";

describe("parseHomeworkMessage", () => {
  it("reads a school group message with subject headers and days", () => {
    const msg = `صباح الخير يا أولياء الأمور 🌸
واجب يوم الأحد:
عربي:
- حل تمارين صفحة ١٢
- حفظ النشيد
رياضيات: كراسة صفحة 30 و 31
English: Workbook page 8
مع تحيات ميس منى`;
    const out = parseHomeworkMessage(msg, TODAY);
    expect(out).toEqual([
      { title: "حل تمارين صفحة ١٢", subject: "عربي", due_day: "2026-11-29" },
      { title: "حفظ النشيد", subject: "عربي", due_day: "2026-11-29" },
      { title: "رياضيات: كراسة صفحة 30 و 31", subject: "رياضيات", due_day: "2026-11-29" },
      { title: "English: Workbook page 8", subject: "إنجليزي", due_day: "2026-11-29" },
    ]);
  });

  it("reads tomorrow and numbered lines, in English", () => {
    const out = parseHomeworkMessage("Dear parents,\n1) Math page 12 for tomorrow\n2. Science: read lesson 3", TODAY);
    expect(out).toEqual([
      { title: "Math page 12 for tomorrow", subject: "Math", due_day: "2026-11-27" },
      { title: "Science: read lesson 3", subject: "Science", due_day: null },
    ]);
  });

  it("keeps a plain line with no subject or day", () => {
    expect(parseHomeworkMessage("ذاكر درس الكسور", TODAY)).toEqual([{ title: "ذاكر درس الكسور", subject: null, due_day: null }]);
  });

  it("stops at 15 and skips empty text", () => {
    expect(parseHomeworkMessage("", TODAY)).toEqual([]);
    const many = Array.from({ length: 30 }, (_, i) => `تمرين رقم ${i + 1}`).join("\n");
    expect(parseHomeworkMessage(many, TODAY)).toHaveLength(15);
  });
});

describe("pocketTotals", () => {
  it("adds earned, takes off paid, and counts the last week", () => {
    const now = new Date("2026-11-26T12:00:00Z");
    const t = pocketTotals(
      [
        { kind: "earned", amount: 10, createdAt: new Date("2026-11-25T10:00:00Z") },
        { kind: "earned", amount: 20, createdAt: new Date("2026-11-10T10:00:00Z") },
        { kind: "paid", amount: 15, createdAt: new Date("2026-11-20T10:00:00Z") },
      ],
      now,
    );
    expect(t).toEqual({ earned: 30, paid: 15, balance: 15, weekEarned: 10 });
  });
});
