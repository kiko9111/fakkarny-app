import { describe, expect, it } from "vitest";
import type { CircleTask, PocketAccount } from "@fakkarni/shared";
import { circleBooks, circleSplits, dayKind, homeworkSections, pocketIn, splitLeft, taskSections } from "./jobs";

const now = new Date(2026, 10, 27, 10, 0, 0);
const at = (days: number, hour = 8) => new Date(2026, 10, 27 + days, hour, 0, 0).toISOString();

let n = 0;
const task = (over: Partial<CircleTask>): CircleTask => ({
  id: `t${++n}`,
  circle_id: "c1",
  circle_name: "Home",
  title: "x",
  due_at: null,
  remind_at: null,
  homework: false,
  note: null,
  subject: null,
  reward: null,
  submission: null,
  submitted_at: null,
  photo_ids: [],
  review: null,
  review_note: null,
  status: "accepted",
  role: "assigner",
  assigner_name: null,
  assignee_name: null,
  assignee_id: null,
  can_nudge: false,
  created_at: at(-1),
  responded_at: null,
  done_at: null,
  ...over,
});

describe("a circle's tasks", () => {
  it("leaves homework and cancelled out, and puts what waits for me first", () => {
    const mine = task({ status: "pending", role: "assignee" });
    const asked = task({ status: "pending", role: "assigner" });
    const going = task({ status: "accepted", role: "watcher" });
    const finished = task({ status: "done" });
    const s = taskSections([finished, going, task({ homework: true }), asked, task({ status: "cancelled" }), mine]);
    expect(s.waiting).toEqual([mine]);
    expect(s.open.map((t) => t.id).sort()).toEqual([asked.id, going.id].sort());
    expect(s.done).toEqual([finished]);
  });

  it("keeps only the newest finished ones", () => {
    const many = Array.from({ length: 8 }, (_, i) => task({ status: "done", created_at: at(-i - 1) }));
    const s = taskSections(many);
    expect(s.done).toHaveLength(5);
    expect(s.done[0]).toBe(many[0]);
  });
});

describe("a circle's homework", () => {
  it("puts handed-in homework to review first, oldest hand-in first", () => {
    const later = task({ homework: true, status: "done", submission: "b", submitted_at: at(0, 9), done_at: at(0, 9) });
    const first = task({ homework: true, status: "done", submission: "", submitted_at: at(-1), done_at: at(-1) });
    const s = homeworkSections([later, first], now);
    expect(s.review).toEqual([first, later]);
    expect(s.done).toEqual([]);
  });

  it("does not ask the child, or a watcher, to review", () => {
    const s = homeworkSections([task({ homework: true, role: "assignee", status: "done", submission: "a", done_at: at(0, 9) })], now);
    expect(s.review).toEqual([]);
    expect(s.done).toHaveLength(1);
  });

  it("groups open homework by day: late, the days in order, then no day", () => {
    const none = task({ homework: true });
    const tomorrow = task({ homework: true, due_at: at(1), status: "pending" });
    const today = task({ homework: true, due_at: at(0, 21) });
    const late = task({ homework: true, due_at: at(-2) });
    const s = homeworkSections([none, tomorrow, today, late, task({ homework: false, due_at: at(0) })], now);
    expect(s.days.map((d) => d.key)).toEqual(["late", "2026-11-27", "2026-11-28", "none"]);
    expect(s.days.map((d) => d.tasks[0])).toEqual([late, today, tomorrow, none]);
  });

  it("shows reviewed homework for a week, and a declined one first (the parent has to see it)", () => {
    const fresh = task({ homework: true, status: "done", submission: "a", review: "approved", done_at: at(-2) });
    const old = task({ homework: true, status: "done", submission: "a", review: "approved", done_at: at(-9) });
    const declined = task({ homework: true, status: "declined" });
    const s = homeworkSections([old, fresh, declined], now);
    expect(s.done).toEqual([declined, fresh]);
    expect(s.days).toEqual([]);
  });

  it("names today and tomorrow", () => {
    expect(dayKind("2026-11-27", now)).toBe("today");
    expect(dayKind("2026-11-28", now)).toBe("tomorrow");
    expect(dayKind("2026-11-30", now)).toBe("date");
    // The month's last day: tomorrow is in the next month.
    expect(dayKind("2026-12-01", new Date(2026, 10, 30, 23, 0))).toBe("tomorrow");
  });
});

describe("a circle's money", () => {
  it("keeps this circle's shared books, oldest first", () => {
    const rows = [
      { id: "a", circle_id: "c1", created_at: at(-1) },
      { id: "b", circle_id: null, created_at: at(-3) },
      { id: "c", circle_id: "c2", created_at: at(-2) },
      { id: "d", circle_id: "c1", created_at: at(-4) },
    ];
    expect(circleBooks(rows, "c1").map((r) => r.id)).toEqual(["d", "a"]);
  });

  it("keeps this circle's splits, newest first, also from before group splits", () => {
    const rows = [
      { id: "a", circle_id: "c1", created_at: at(-4) },
      { id: "b", created_at: at(-3) },
      { id: "c", circle_id: "c1", created_at: at(-1) },
    ];
    expect(circleSplits(rows, "c1").map((r) => r.id)).toEqual(["c", "a"]);
  });

  it("counts who still has to pay the payer", () => {
    const people = [{ paid: false }, { paid: true }, { paid: false }] as never;
    expect(splitLeft({ paid_by: 0, people })).toBe(1);
    expect(splitLeft({ paid_by: null, people })).toBe(0);
  });

  it("narrows pocket money to a circle only when one is given", () => {
    const accounts = [{ circle_id: "c1" }, { circle_id: "c2" }] as PocketAccount[];
    expect(pocketIn(accounts, "c1")).toEqual([accounts[0]]);
    expect(pocketIn(accounts)).toEqual(accounts);
  });
});
