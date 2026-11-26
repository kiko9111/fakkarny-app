import { describe, expect, it } from "vitest";
import { dayLabel, dayOf, opensDay } from "./days";

// Local wall-clock times, so the tests hold in any time zone.
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).toISOString();
const words = { today: "Today", yesterday: "Yesterday" };

describe("the line between days in the chat", () => {
  it("opens a day at its first message only", () => {
    const nightBefore = at(2026, 11, 25, 23, 50);
    const morning = at(2026, 11, 26, 0, 5);
    const later = at(2026, 11, 26, 18, 0);
    expect(opensDay(morning, nightBefore)).toBe(true);
    expect(opensDay(later, morning)).toBe(false);
    expect(opensDay(nightBefore, undefined)).toBe(true);
  });

  it("gives the greeting, which has no real time, no day, and the first real message its own", () => {
    const greeting = new Date(0).toISOString();
    expect(dayOf(greeting)).toBeNull();
    expect(opensDay(greeting, undefined)).toBe(false);
    expect(opensDay(at(2026, 11, 26), greeting)).toBe(true);
    expect(dayOf("not a date")).toBeNull();
  });

  it("says Today and Yesterday, then the weekday, then the date", () => {
    const now = new Date(2026, 10, 26, 9, 0);
    expect(dayLabel(at(2026, 11, 26, 0, 1), now, words, "en-US")).toBe("Today");
    expect(dayLabel(at(2026, 11, 25, 23, 59), now, words, "en-US")).toBe("Yesterday");
    expect(dayLabel(at(2026, 11, 23), now, words, "en-US")).toBe("Monday");
    expect(dayLabel(at(2026, 11, 20), now, words, "en-US")).toBe("Friday");
    expect(dayLabel(at(2026, 11, 19), now, words, "en-US")).toBe("Thu, November 19");
    expect(dayLabel(at(2025, 12, 31), now, words, "en-US")).toBe("December 31, 2025");
  });

  it("writes Arabic dates with the digits the rest of the app uses", () => {
    const now = new Date(2026, 10, 26, 9, 0);
    const label = dayLabel(at(2026, 11, 9), now, words, "ar-EG-u-nu-latn");
    expect(label).toContain("9");
    expect(label).toContain("نوفمبر");
    expect(label).not.toMatch(/[٠-٩]/);
  });

  it("never calls a message tomorrow's: a clock running behind reads as today", () => {
    const now = new Date(2026, 10, 26, 23, 58);
    expect(dayLabel(at(2026, 11, 27, 0, 3), now, words, "en-US")).toBe("Today");
  });

  it("counts calendar days, not 24 hours", () => {
    // 01:00 today and 23:00 the day before are two hours apart, and a day apart.
    const now = new Date(2026, 10, 26, 1, 0);
    expect(dayLabel(at(2026, 11, 25, 23, 0), now, words, "en-US")).toBe("Yesterday");
  });
});
