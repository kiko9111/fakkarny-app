import { describe, expect, it } from "vitest";
import { understand } from "./index";
import { parseWhen as pw } from "./when";
import { fold } from "./text";
const parseWhen = (t: string, n: { local: string }) => pw(fold(t), n);
import { pickUnderstood } from "./clarify";

const now = "2026-11-19T10:00"; // Thursday
const u = (text: string, extra: Partial<Parameters<typeof understand>[0]> = {}) => understand({ text, nowLocal: now, ...extra });

describe("when", () => {
  it("reads days and clocks in three scripts", () => {
    expect(parseWhen("بكره الساعه ٣ العصر", { local: now })).toMatchObject({ date: "2026-11-20", clocks: [{ h: 15, m: 0 }] });
    expect(parseWhen("ba3d bokra el sa3a 4 w nos", { local: now })).toMatchObject({ date: "2026-11-21", clocks: [{ h: 16, m: 30 }] });
    expect(parseWhen("next monday at 9am", { local: now })).toMatchObject({ date: "2026-11-23", clocks: [{ h: 9, m: 0 }] });
  });
  it("reads repeats and relative times", () => {
    expect(parseWhen("every 8 hours", { local: now })).toMatchObject({ repeat: 480 });
    expect(parseWhen("كمان نص ساعه", { local: now })).toMatchObject({ relMin: 30 });
  });
  it("chains hours forward", () => {
    expect(parseWhen("الساعه ٢ و ٨", { local: now }).clocks).toEqual([{ h: 14, m: 0 }, { h: 20, m: 0 }]);
  });
});

describe("understand", () => {
  it("sets reminders with exact times, follow-ups and importance", () => {
    expect(u("عندي دكتور عيون يوم الاحد الساعة ٥ ونص").create_items[0]).toMatchObject({ type: "reminder", due_at_local: "2026-11-22T17:30", follow_up_at_local: "2026-11-22T18:30" });
    expect(u("remind me every 8 hours to take my antibiotic").create_items[0]).toMatchObject({ repeat_every_minutes: 480, important: true });
  });
  it("asks for a missing time instead of guessing", () => {
    const r = u("فكرني أكلم خالد");
    expect(r.ask).toBe("time");
    expect(r.create_items).toHaveLength(0);
  });
  it("leaves plain talk alone", () => {
    for (const text of ["النهارده كان يوم طويل اوي في الشغل", "el match bokra el sa3a 9 hayb2a nar", "watched a great movie last night"]) {
      const r = u(text);
      expect([r.create_items, r.update_items, r.app_actions]).toEqual([[], [], []]);
    }
  });
  it("records debts both ways", () => {
    expect(u("سلفت محمود ٥٠٠ جنيه").create_items[0]?.debt).toEqual({ person: "محمود", amount: 500, direction: "owed_to_me" });
    expect(u("3alaya 500 l 7assan").create_items[0]?.debt).toMatchObject({ amount: 500, direction: "i_owe" });
  });
  it("changes open items by what they're about", () => {
    const openItems = [{ id: "a", type: "reminder" as const, title: "Call the plumber", due_local: "2026-11-20T10:00" }];
    expect(u("change the plumber to 11", { openItems }).update_items).toEqual([{ id: "a", due_at_local: "2026-11-20T11:00", remind_at_local: "2026-11-20T11:00" }]);
    expect(u("cancel the plumber", { openItems }).ask).toBe("confirm");
  });
  it("splits the bill with circle members by name", () => {
    const app = { circles: [{ name: "البيت", kind: "family", members: ["منى", "عمر"] }] };
    expect(u("2asem 750 ben ana w mona w omar", { app }).app_actions[0]).toMatchObject({ kind: "split_bill", amount: 750, people: ["منى", "عمر"] });
  });
  it("flags crisis and does nothing else", () => {
    expect(u("مبقتش عايز أعيش")).toMatchObject({ crisis: true, create_items: [] });
  });
});

describe("pickUnderstood", () => {
  it("keeps the code's own reading and uses a rewrite only when it found nothing", () => {
    const original = u("3andy doctor bokra el sa3a 5");
    const rewrite = u("عندي دكتور بكرة الساعة 6");
    expect(pickUnderstood(original, rewrite)).toBe(original);
    const none = u("3ndydctrbkr5");
    expect(pickUnderstood(none, rewrite).create_items[0]?.due_at_local).toBe("2026-11-20T18:00");
  });
});
