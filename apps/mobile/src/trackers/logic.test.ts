import { describe, expect, it } from "vitest";
import { canAdd, monthBars, progress, suggestTracker, toggleAskTime, weekBars } from "./logic";

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

describe("tracker builder helpers", () => {
  it("keeps at most three ask times, in order", () => {
    expect(toggleAskTime([], "21:00")).toEqual(["21:00"]);
    expect(toggleAskTime(["21:00"], "08:00")).toEqual(["08:00", "21:00"]);
    expect(toggleAskTime(["08:00", "13:00", "21:00"], "18:00")).toEqual(["08:00", "13:00", "21:00"]);
    expect(toggleAskTime(["08:00", "21:00"], "08:00")).toEqual(["21:00"]);
  });
  it("scales the month graph to the goal", () => {
    expect(monthBars({ month: [0, 5, 10], goal: 10, cumulative: false })).toEqual([0, 0.5, 1]);
    expect(monthBars({ month: [], goal: null, cumulative: false })).toEqual([]);
  });
  it("suggests a tracker only for a clear daily habit", () => {
    expect(suggestTracker("عايز أتعود على القراية كل يوم")).toBe("القراية");
    expect(suggestTracker("نفسي أمشي نص ساعة كل يوم")).toBe("أمشي نص ساعة");
    expect(suggestTracker("I want to start reading every day")).toBe("reading");
    expect(suggestTracker("فكّرني بكرة أكلم ماما")).toBeNull();
    expect(suggestTracker("بشرب قهوة كل يوم")).toBeNull();
  });
});
