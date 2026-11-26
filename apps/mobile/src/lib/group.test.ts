import { describe, expect, it } from "vitest";
import type { Item } from "@fakkarni/shared";
import { groupUpcoming, summarizeDebts } from "./group";

const item = (o: Partial<Item>): Item => ({
  id: o.title ?? "x",
  user_id: "",
  type: "reminder",
  title: "x",
  due_at: null,
  remind_at: null,
  important: false,
  alarm: false,
  nudge: null,
  status: "open",
  debt_person: null,
  debt_amount: null,
  debt_direction: null,
  follow_up_at: null,
  repeat_every_minutes: null,
    place: null,
    place_on: null,
  source_message_id: null,
  updated_at: "2026-11-19T00:00:00.000Z",
  created_at: "2026-11-19T00:00:00.000Z",
  done_at: null,
  ...o,
});

describe("groupUpcoming", () => {
  const now = new Date(2026, 10, 19, 10, 0); // local time
  it("buckets by local day, with overdue under today and undated last", () => {
    const groups = groupUpcoming(
      [
        item({ title: "overdue", due_at: new Date(2026, 10, 18, 9).toISOString() }),
        item({ title: "today", due_at: new Date(2026, 10, 19, 18).toISOString() }),
        item({ title: "tomorrow", due_at: new Date(2026, 10, 20, 9).toISOString() }),
        item({ title: "sunday", due_at: new Date(2026, 10, 22, 18).toISOString() }),
        item({ title: "someday" }),
      ],
      now,
    );
    expect(groups.map((g) => [g.bucket, g.items.map((i) => i.title)])).toEqual([
      ["today", ["overdue", "today"]],
      ["tomorrow", ["tomorrow"]],
      ["later", ["sunday"]],
      ["noDate", ["someday"]],
    ]);
  });

  it("places a plan with only a reminder time by that time, in order", () => {
    const groups = groupUpcoming(
      [
        item({ title: "evening", due_at: new Date(2026, 10, 19, 20).toISOString() }),
        item({ title: "remind at noon", remind_at: new Date(2026, 10, 19, 12).toISOString() }),
        item({ title: "remind tomorrow", remind_at: new Date(2026, 10, 20, 9).toISOString() }),
        item({ title: "someday" }),
      ],
      now,
    );
    expect(groups.map((g) => [g.bucket, g.items.map((i) => i.title)])).toEqual([
      ["today", ["remind at noon", "evening"]],
      ["tomorrow", ["remind tomorrow"]],
      ["noDate", ["someday"]],
    ]);
  });
});

describe("summarizeDebts", () => {
  it("totals per person and direction, ignoring paid debts", () => {
    const s = summarizeDebts([
      item({ id: "1", type: "debt", debt_person: "Ahmed", debt_amount: 500, debt_direction: "owed_to_me" }),
      item({ id: "2", type: "debt", debt_person: "ahmed", debt_amount: 300, debt_direction: "owed_to_me" }),
      item({ id: "3", type: "debt", debt_person: "Mahmoud", debt_amount: 1200, debt_direction: "owed_to_me" }),
      item({ id: "4", type: "debt", debt_person: "Sister", debt_amount: 2000, debt_direction: "i_owe" }),
      item({ id: "5", type: "debt", debt_person: "Karim", debt_amount: 900, debt_direction: "owed_to_me", status: "done" }),
    ]);
    expect(s.owedToMe.map((p) => [p.person, p.total])).toEqual([
      ["Mahmoud", 1200],
      ["Ahmed", 800],
    ]);
    expect(s.iOwe.map((p) => [p.person, p.total])).toEqual([["Sister", 2000]]);
  });
});
