import { describe, expect, it } from "vitest";
import { CareMed, type Item } from "@fakkarni/shared";
import { dayOf, glancePlans, isLatePlan, MAX_NEEDS, nextLine, rankNeeds, shown } from "./glance";

const now = new Date("2026-11-28T12:00:00.000Z");
const item = (id: string, over: Partial<Item> = {}): Item =>
  ({ id, type: "reminder", title: id, due_at: null, remind_at: null, important: false, status: "open", repeat_every_minutes: null, alarm: false, ...over }) as Item;

describe("rankNeeds", () => {
  it("puts doses first, then late or due-today money, requests, reviews, the Daftar, splits, the rest", () => {
    const rows = [
      { kind: "gameya", id: "soon" },
      { kind: "split", id: "s" },
      { kind: "daftar", id: "d" },
      { kind: "homework_review", id: "h" },
      { kind: "task", id: "t1" },
      { kind: "task", id: "t2" },
      { kind: "gameya", id: "late", tone: "danger" },
      { kind: "dose", id: "dose", tone: "danger" },
    ] as const;
    expect(rankNeeds(rows).map((r) => r.id)).toEqual(["dose", "late", "t1", "t2", "h", "d", "s", "soon"]);
  });
});

describe("plans", () => {
  it("calls a one-off plan late only when every time passed over an hour ago", () => {
    expect(isLatePlan(item("a", { remind_at: "2026-11-28T10:00:00.000Z" }), now)).toBe(true);
    expect(isLatePlan(item("a", { remind_at: "2026-11-28T11:30:00.000Z" }), now)).toBe(false);
    expect(isLatePlan(item("a", { remind_at: "2026-11-28T10:00:00.000Z", due_at: "2026-11-29T10:00:00.000Z" }), now)).toBe(false);
    expect(isLatePlan(item("a"), now)).toBe(false);
    expect(isLatePlan(item("a", { remind_at: "2026-11-28T10:00:00.000Z", repeat_every_minutes: 60 }), now)).toBe(false);
  });

  it("keeps the newest late plan first, then what is ahead, no time, repeating, older late ones", () => {
    const { rows, late } = glancePlans(
      [
        item("old", { remind_at: "2026-11-26T10:00:00.000Z" }),
        item("newLate", { remind_at: "2026-11-28T09:00:00.000Z" }),
        item("soon", { remind_at: "2026-11-28T15:00:00.000Z" }),
        item("untimed"),
        item("daily", { remind_at: "2026-11-28T18:00:00.000Z", repeat_every_minutes: 1440 }),
      ],
      now,
    );
    expect(rows.map((i) => i.id)).toEqual(["newLate", "soon", "untimed", "daily", "old"]);
    expect(late.map((i) => i.id)).toEqual(["newLate", "old"]);
  });

  it("caps the inbox and the plans, and a filter shows only its own", () => {
    const needs = [1, 2, 3, 4, 5, 6];
    const plans = ["a", "b", "c", "d", "e", "f"];
    expect(shown(null, needs, plans, ["a"], false)).toEqual({ needs: needs.slice(0, MAX_NEEDS), moreNeeds: 2, plans: ["a", "b", "c"], morePlans: 3 });
    expect(shown(null, needs, plans, [], true).moreNeeds).toBe(0);
    expect(shown(null, [], plans, [], false).plans).toHaveLength(5);
    expect(shown("late", needs, plans, ["a"], false)).toEqual({ needs: [], moreNeeds: 0, plans: ["a"], morePlans: 0 });
    expect(shown("needs", needs, plans, [], false).needs).toHaveLength(6);
    expect(shown("plans", needs, plans, [], false).plans).toHaveLength(6);
  });

  it("names a plan's day", () => {
    const at = new Date(2026, 10, 28, 12, 0);
    expect(dayOf(new Date(2026, 10, 28, 23, 30).toISOString(), at)).toBe("today");
    expect(dayOf(new Date(2026, 10, 29, 0, 30).toISOString(), at)).toBe("tomorrow");
    expect(dayOf(new Date(2026, 10, 30, 9, 0).toISOString(), at)).toBe("other");
    expect(dayOf(new Date(2026, 10, 27, 9, 0).toISOString(), at)).toBe("other");
  });
});

describe("nextLine", () => {
  const words = { dose: "Next dose {time} · {name}", turn: "Your turn · {name}", clock: (t: string) => t };
  const med = (over: object) =>
    CareMed.parse({ id: "00000000-0000-4000-8000-000000000001", circle_id: "c1", person_name: "Mama", name: "Concor", times: ["20:00"], time_zone: "Africa/Cairo", missed_after_minutes: 60, active: true, created_at: "2026-11-20T10:00:00.000Z", ...over });

  it("says the earliest dose still to come today", () => {
    const meds = [
      med({ today: [{ due_at: "2026-11-28T18:00:00.000Z", time: "20:00", state: "later" }] }),
      med({ person_name: "Baba", today: [{ due_at: "2026-11-28T06:00:00.000Z", time: "08:00", state: "taken" }, { due_at: "2026-11-28T14:00:00.000Z", time: "16:00", state: "later" }] }),
    ];
    expect(nextLine({ care: meds }, words)).toEqual({ text: "Next dose 16:00 · Baba", route: "/circle/care?id=c1" });
  });

  it("says nothing when every dose is marked or the medicine is paused", () => {
    expect(nextLine({ care: [med({ today: [{ due_at: "2026-11-28T06:00:00.000Z", time: "08:00", state: "taken" }] }), med({ active: false, today: [{ due_at: "2026-11-28T18:00:00.000Z", time: "20:00", state: "later" }] })] }, words)).toBeNull();
    expect(nextLine({}, words)).toBeNull();
  });
});
