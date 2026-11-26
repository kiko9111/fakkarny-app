import { describe, expect, it } from "vitest";
import type { Item } from "@fakkarni/shared";
import { comingUp } from "./coming-up";

const item = (id: string, at: string | null, repeat: number | null = null) => ({ id, remind_at: at, due_at: at, repeat_every_minutes: repeat }) as Item;

describe("comingUp", () => {
  it("never lets daily reminders hide a new one-off plan", () => {
    const prayers = ["17:15", "19:35", "05:50", "12:40", "15:05"].map((h, n) => item(`p${n}`, `2026-11-25T${h}:00Z`, 1440));
    const khaled = item("khaled", "2026-11-25T16:00:00Z");
    const out = comingUp([...prayers, khaled], new Date("2026-11-25T05:00:00Z"));
    expect(out.soon.map((i) => i.id)).toEqual(["khaled"]);
    expect(out.repeating.map((i) => i.id)).toEqual(["p2", "p3", "p4", "p0", "p1"]);
    expect(out.more).toBe(0);
  });

  it("puts untimed plans after the timed ones and counts what doesn't fit", () => {
    const items = [item("none", null), ...Array.from({ length: 6 }, (_, n) => item(`t${n}`, `2026-11-2${n}T10:00:00Z`))];
    const out = comingUp(items, new Date("2026-11-19T10:00:00Z"));
    expect(out.soon.map((i) => i.id)).toEqual(["t0", "t1", "t2", "t3", "t4"]);
    expect(out.more).toBe(2);
  });

  it("never lets plans left open from before hide one the user just asked for", () => {
    // Six reminders that rang over the last days and were never ticked, then a new one for tonight.
    const old = Array.from({ length: 6 }, (_, n) => item(`old${n}`, `2026-11-2${n}T09:00:00Z`));
    const tonight = item("tonight", "2026-11-26T19:00:00Z");
    const out = comingUp([...old, tonight], new Date("2026-11-26T12:00:00Z"));
    // What is ahead first; then the ones that passed, the latest first.
    expect(out.soon.map((i) => i.id)).toEqual(["tonight", "old5", "old4", "old3", "old2"]);
    expect(out.more).toBe(2);
  });

  it("keeps a plan from the last hour at the top: it is happening now", () => {
    const now = new Date("2026-11-26T12:00:00Z");
    const out = comingUp([item("later", "2026-11-26T18:00:00Z"), item("now", "2026-11-26T11:30:00Z"), item("morning", "2026-11-26T08:00:00Z")], now);
    expect(out.soon.map((i) => i.id)).toEqual(["now", "later", "morning"]);
  });

  it("shows plans with no time before the ones whose time passed", () => {
    const now = new Date("2026-11-26T12:00:00Z");
    const out = comingUp([item("yesterday", "2026-11-25T09:00:00Z"), item("bread", null), item("tomorrow", "2026-11-27T09:00:00Z")], now);
    expect(out.soon.map((i) => i.id)).toEqual(["tomorrow", "bread", "yesterday"]);
  });

  it("orders by when Zaki reminds when that comes before the plan's own time", () => {
    const now = new Date("2026-11-26T12:00:00Z");
    const dentist = { ...item("dentist", "2026-11-27T17:00:00Z"), remind_at: "2026-11-26T15:00:00Z" } as Item;
    const out = comingUp([item("call", "2026-11-26T16:00:00Z"), dentist], now);
    expect(out.soon.map((i) => i.id)).toEqual(["dentist", "call"]);
  });

  it("keeps a plan in place by its own time once its early reminder has passed", () => {
    // Zaki reminded this morning about tomorrow's dentist: the plan is still ahead, and five plans
    // with no time must not push it out of Today's five places.
    const now = new Date("2026-11-26T12:00:00Z");
    const dentist = { ...item("dentist", "2026-11-27T17:00:00Z"), remind_at: "2026-11-26T09:00:00Z" } as Item;
    const untimed = Array.from({ length: 5 }, (_, n) => item(`u${n}`, null));
    const out = comingUp([...untimed, item("call", "2026-11-26T16:00:00Z"), dentist], now);
    expect(out.soon.map((i) => i.id)).toEqual(["call", "dentist", "u0", "u1", "u2"]);
    expect(out.more).toBe(2);
  });

  it("sorts by the reminder while it is ahead, then by the plan's own time", () => {
    const now = new Date("2026-11-26T12:00:00Z");
    // Reminder at 15:00 for a plan at 20:00, and a plan at 18:00 with no reminder of its own.
    const dinner = { ...item("dinner", "2026-11-26T20:00:00Z"), remind_at: "2026-11-26T15:00:00Z" } as Item;
    const gym = item("gym", "2026-11-26T18:00:00Z");
    expect(comingUp([gym, dinner], now).soon.map((i) => i.id)).toEqual(["dinner", "gym"]);
    // At 16:30 the reminder has rung over an hour ago: dinner (20:00) now sorts after the gym.
    expect(comingUp([gym, dinner], new Date("2026-11-26T16:30:00Z")).soon.map((i) => i.id)).toEqual(["gym", "dinner"]);
  });

  it("counts a plan as passed only when all of its times have, and orders those by the latest", () => {
    const now = new Date("2026-11-26T12:00:00Z");
    // Reminded yesterday at 08:00 for a deadline yesterday at 23:00; another with only a reminder at 20:00.
    const report = { ...item("report", "2026-11-25T23:00:00Z"), remind_at: "2026-11-25T08:00:00Z" } as Item;
    const call = { ...item("call", null), remind_at: "2026-11-25T20:00:00Z" } as Item;
    const out = comingUp([call, report, item("bread", null)], now);
    expect(out.soon.map((i) => i.id)).toEqual(["bread", "report", "call"]);
  });

  it("ignores a time it can't read", () => {
    const now = new Date("2026-11-26T12:00:00Z");
    const odd = { ...item("odd", "not a time"), remind_at: "2026-11-26T18:00:00Z" } as Item;
    expect(comingUp([item("none", null), odd], now).soon.map((i) => i.id)).toEqual(["odd", "none"]);
  });
});
