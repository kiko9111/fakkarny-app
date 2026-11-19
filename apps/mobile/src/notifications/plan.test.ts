import { describe, expect, it } from "vitest";
import { fill, planReminderNotifications, type ReminderItem } from "./plan";

const now = new Date("2026-11-22T10:00:00Z");
const clearText = (title: string, due: Date) => `Just so you don't miss it: ${title} at ${due.toISOString().slice(11, 16)}`;
const dentist: ReminderItem = {
  id: "d1",
  title: "Dentist",
  nudge: "Are you heading out soon? Traffic to Dokki is crazy at this hour 😅",
  status: "open",
  due_at: "2026-11-22T16:00:00.000Z",
  remind_at: "2026-11-22T15:00:00.000Z",
  important: false,
};

describe("planReminderNotifications", () => {
  it("sends the indirect hint, then a clear backup 30 min before", () => {
    const p = planReminderNotifications(dentist, { now, alwaysDirect: false, clearText });
    expect(p.map((n) => [n.kind, n.date.toISOString()])).toEqual([
      ["hint", "2026-11-22T15:00:00.000Z"],
      ["clear", "2026-11-22T15:30:00.000Z"],
    ]);
    expect(p[0]!.body).toContain("Traffic to Dokki");
    expect(p[1]!.body).toBe("Just so you don't miss it: Dentist at 16:00");
  });

  it("gives important items the clear version at the due time", () => {
    const p = planReminderNotifications({ ...dentist, important: true }, { now, alwaysDirect: false, clearText });
    expect(p[1]!.date.toISOString()).toBe("2026-11-22T16:00:00.000Z");
  });

  it("only sends the clear version when the user chose always direct", () => {
    const p = planReminderNotifications(dentist, { now, alwaysDirect: true, clearText });
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ kind: "clear", identifier: "item_d1_clear" });
  });

  it("skips past times, done items, and items without a time", () => {
    expect(planReminderNotifications(dentist, { now: new Date("2026-11-22T15:10:00Z"), alwaysDirect: false, clearText }).map((n) => n.kind)).toEqual(["clear"]);
    expect(planReminderNotifications({ ...dentist, status: "done" }, { now, alwaysDirect: false, clearText })).toEqual([]);
    expect(planReminderNotifications({ ...dentist, due_at: null, remind_at: null }, { now, alwaysDirect: false, clearText })).toEqual([]);
  });

  it("falls back to the title when there is no nudge, and to the due time when no remind time", () => {
    const p = planReminderNotifications({ ...dentist, nudge: null, remind_at: null }, { now, alwaysDirect: false, clearText });
    expect(p).toHaveLength(1); // clear would be before the hint, so it's dropped
    expect(p[0]).toMatchObject({ body: "Dentist", date: new Date("2026-11-22T16:00:00.000Z") });
  });
});

describe("fill", () => {
  it("replaces placeholders", () => {
    expect(fill("{title} at {time}", { title: "Dentist", time: "6:00" })).toBe("Dentist at 6:00");
  });
});
