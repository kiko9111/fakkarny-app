import { describe, expect, it } from "vitest";
import { batchItems, dueAtFromDay, localDay, parseReward, practiceNote, shortTitle, sortAccounts } from "./logic";
import type { PocketAccount } from "@fakkarni/shared";

describe("homework logic", () => {
  it("reads a reward in whole pounds, either digits", () => {
    expect(parseReward("25")).toBe(25);
    expect(parseReward("٢٠")).toBe(20);
    expect(parseReward("2.5")).toBeNull();
    expect(parseReward("0")).toBeNull();
    expect(parseReward("5000")).toBeNull();
    expect(parseReward("abc")).toBeNull();
  });

  it("dates homework 08:00 local on its day", () => {
    const iso = dueAtFromDay("2026-11-29")!;
    const d = new Date(iso);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 10, 29, 8]);
    expect(dueAtFromDay(null)).toBeNull();
    expect(dueAtFromDay("29/11")).toBeNull();
    expect(localDay(new Date(2026, 0, 5, 23, 0))).toBe("2026-01-05");
  });

  it("numbers practice questions within 500 characters", () => {
    expect(practiceNote(["1/2 + 1/4 = ?", " 3/4 − 1/4 = ? "])).toBe("1) 1/2 + 1/4 = ?\n2) 3/4 − 1/4 = ?");
    expect(practiceNote(["x".repeat(300), "y".repeat(300)]).length).toBeLessThanOrEqual(500);
    expect(shortTitle("  جمع   الكسور  ")).toBe("جمع الكسور");
    expect(shortTitle("a".repeat(80))).toHaveLength(60);
  });

  it("sends the kept drafts with the reward", () => {
    const drafts = [
      { title: "a", subject: "عربي", due_day: null },
      { title: "b", subject: null, due_day: "2026-11-29" },
    ];
    const items = batchItems(drafts, new Set([0]), 10);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: "b", subject: null, reward: 10 });
    expect(items[0]!.due_at).not.toBeNull();
  });

  it("puts records with money still to give first", () => {
    const base = { circle_id: "c", circle_name: "c", child_id: "k", parent_id: "p", parent_name: "ماما", role: "parent" as const, earned: 0, paid: 0, week_earned: 0, entries: [] };
    const list: PocketAccount[] = [
      { ...base, child_name: "عمر", balance: 0 },
      { ...base, child_name: "ليلى", balance: 15 },
    ];
    expect(sortAccounts(list).map((a) => a.child_name)).toEqual(["ليلى", "عمر"]);
  });
});
