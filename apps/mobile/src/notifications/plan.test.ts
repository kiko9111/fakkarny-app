import { describe, expect, it } from "vitest";
import { fill, itemIdOf, itemPrefix, planReminderNotifications, type ReminderItem } from "./plan";

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

  it("rings an alarm item on the alarm channel at the time itself", () => {
    const p = planReminderNotifications({ ...dentist, alarm: true, follow_up_at: "2026-11-22T18:00:00.000Z" }, { now, alwaysDirect: false, clearText, followupText: (t) => t });
    expect(p.map((n) => [n.kind, n.date.toISOString(), n.alarm ?? false])).toEqual([
      ["hint", "2026-11-22T15:00:00.000Z", true],
      ["clear", "2026-11-22T16:00:00.000Z", true],
      ["followup", "2026-11-22T18:00:00.000Z", false],
    ]);
    expect(planReminderNotifications(dentist, { now, alwaysDirect: false, clearText }).some((n) => n.alarm)).toBe(false);
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

describe("repeating reminders and follow-ups", () => {
  const awake = (at: Date) => at.getUTCHours() >= 7 && at.getUTCHours() < 23;
  const water: ReminderItem = { id: "w1", title: "اشرب مية", nudge: "شربت مية ولا لسه؟", status: "open", due_at: null, remind_at: "2026-11-22T09:30:00.000Z", important: false, repeat_every_minutes: 60 };

  it("plans the next occurrences from the anchor, skipping the night", () => {
    const p = planReminderNotifications(water, { now, alwaysDirect: false, clearText, awake });
    expect(p).toHaveLength(16);
    expect(p[0]!.date.toISOString()).toBe("2026-11-22T10:30:00.000Z");
    expect(p[1]!.date.toISOString()).toBe("2026-11-22T11:30:00.000Z");
    expect(p.every((n) => n.kind === "repeat" && n.body === "شربت مية ولا لسه؟" && awake(n.date))).toBe(true);
    expect(new Set(p.map((n) => n.identifier)).size).toBe(16);
    // 22:30 is the last one today; the next is 07:30 tomorrow.
    const times = p.map((n) => n.date.toISOString());
    expect(times[12]).toBe("2026-11-22T22:30:00.000Z");
    expect(times[13]).toBe("2026-11-23T07:30:00.000Z");
  });

  it("keeps an occurrence's identifier when the window moves on, so only new ones need scheduling", () => {
    const first = planReminderNotifications(water, { now, alwaysDirect: false, clearText, awake });
    const twoHoursOn = planReminderNotifications(water, { now: new Date(now.getTime() + 2 * 3600_000), alwaysDirect: false, clearText, awake });
    const before = new Map(first.map((n) => [n.identifier, n.date.getTime()]));
    const kept = twoHoursOn.filter((n) => before.has(n.identifier));
    expect(kept).toHaveLength(14);
    expect(kept.every((n) => before.get(n.identifier) === n.date.getTime())).toBe(true);
    expect(twoHoursOn.every((n) => n.identifier.startsWith(itemPrefix("w1")))).toBe(true);
  });

  it("includes a first occurrence that is still ahead", () => {
    const later = { ...water, remind_at: "2026-11-22T10:20:00.000Z" };
    const p = planReminderNotifications(later, { now, alwaysDirect: false, clearText, awake });
    expect(p[0]!.date.toISOString()).toBe("2026-11-22T10:20:00.000Z");
    expect(p[1]!.date.toISOString()).toBe("2026-11-22T11:20:00.000Z");
  });

  it("adds a follow-up notification after the event, only in waking hours", () => {
    const withFollow = { ...dentist, follow_up_at: "2026-11-22T18:00:00.000Z" };
    const followupText = (title: string) => `How did ${title} go?`;
    const p = planReminderNotifications(withFollow, { now, alwaysDirect: false, clearText, followupText, awake });
    expect(p.at(-1)).toMatchObject({ kind: "followup", body: "How did Dentist go?" });
    expect(p.at(-1)!.date.toISOString()).toBe("2026-11-22T18:00:00.000Z");
    const night = planReminderNotifications({ ...withFollow, follow_up_at: "2026-11-22T23:30:00.000Z" }, { now, alwaysDirect: false, clearText, followupText, awake });
    expect(night.some((n) => n.kind === "followup")).toBe(false);
  });
});

describe("itemIdOf", () => {
  it("reads the item from every identifier this app schedules, and nothing else", () => {
    expect(itemIdOf("item_9f1c-22_hint")).toBe("9f1c-22");
    expect(itemIdOf("item_9f1c-22_clear")).toBe("9f1c-22");
    expect(itemIdOf("item_9f1c-22_followup")).toBe("9f1c-22");
    expect(itemIdOf("item_9f1c-22_snooze")).toBe("9f1c-22");
    expect(itemIdOf("item_9f1c-22_r29412345")).toBe("9f1c-22");
    expect(itemIdOf("item_a_b_hint")).toBe("a_b");
    expect(itemIdOf("zaki-message")).toBeNull();
    expect(itemIdOf("item_x_other")).toBeNull();
  });
});
