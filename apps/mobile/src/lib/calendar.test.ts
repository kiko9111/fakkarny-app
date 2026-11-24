import { describe, expect, it } from "vitest";
import { addMonths, atTime, defaultPick, from12, monthGrid, pastDay, to12 } from "./calendar";

describe("calendar", () => {
  it("lays November 2026 out from Saturday", () => {
    // 1 Nov 2026 is a Sunday: one pad cell when weeks start on Saturday.
    const weeks = monthGrid(2026, 10, 6);
    expect(weeks[0]![0]).toBeNull();
    expect(weeks[0]![1]!.getDate()).toBe(1);
    expect(weeks.flat().filter(Boolean)).toHaveLength(30);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });
  it("starts on the first cell when the month starts on the week start", () => {
    expect(monthGrid(2026, 10, 0)[0]![0]!.getDate()).toBe(1);
  });
  it("moves across years", () => {
    expect(addMonths(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(addMonths(2027, 0, -1)).toEqual({ year: 2026, month: 11 });
  });
  it("treats today as pickable and yesterday as past", () => {
    const now = new Date(2026, 10, 24, 15, 0);
    expect(pastDay(new Date(2026, 10, 24, 1, 0), now)).toBe(false);
    expect(pastDay(new Date(2026, 10, 23, 23, 0), now)).toBe(true);
  });
  it("converts 12-hour clock", () => {
    expect(to12(0)).toEqual({ h: 12, pm: false });
    expect(to12(12)).toEqual({ h: 12, pm: true });
    expect(to12(17)).toEqual({ h: 5, pm: true });
    expect(from12(12, false)).toBe(0);
    expect(from12(12, true)).toBe(12);
    expect(from12(5, true)).toBe(17);
    expect(atTime(new Date(2026, 10, 24), 17, 30).getHours()).toBe(17);
  });
  it("defaults to a whole hour at least 30 minutes away", () => {
    expect(defaultPick(new Date(2026, 10, 24, 15, 40)).getHours()).toBe(17);
    expect(defaultPick(new Date(2026, 10, 24, 15, 10)).getHours()).toBe(16);
  });
});
