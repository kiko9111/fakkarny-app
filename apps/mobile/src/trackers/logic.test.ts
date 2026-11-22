import { describe, expect, it } from "vitest";
import { canAdd, progress, weekBars } from "./logic";

describe("tracker logic", () => {
  it("measures progress against the right number", () => {
    expect(progress({ goal: 8, cumulative: false, today: 2, total: 50 })).toBe(0.25);
    expect(progress({ goal: 8, cumulative: false, today: 12, total: 50 })).toBe(1);
    expect(progress({ goal: 5000, cumulative: true, today: 0, total: 500 })).toBe(0.1);
    expect(progress({ goal: null, cumulative: false, today: 300, total: 900 })).toBeNull();
  });
  it("scales the week strip to the goal or the best day", () => {
    expect(weekBars({ week: [0, 0, 0, 0, 0, 8, 2], goal: 8, cumulative: false })).toEqual([0, 0, 0, 0, 0, 1, 0.25]);
    expect(weekBars({ week: [0, 0, 0, 0, 0, 100, 400], goal: null, cumulative: false })).toEqual([0, 0, 0, 0, 0, 0.25, 1]);
    expect(weekBars({ week: [0, 0, 0, 0, 0, 0, 0], goal: null, cumulative: false })).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
  it("knows when the free slot is used", () => {
    expect(canAdd(0, 1)).toBe(true);
    expect(canAdd(1, 1)).toBe(false);
    expect(canAdd(7, null)).toBe(true);
  });
});
