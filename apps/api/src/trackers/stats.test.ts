import { describe, expect, it } from "vitest";
import { dayBefore, dayKey, trackerStats } from "./stats";

const TZ = "Africa/Cairo";
const at = (iso: string) => new Date(iso);

describe("tracker stats", () => {
  it("uses the user's local day, not the UTC day", () => {
    // 23:30 UTC on the 21st is already 01:30 on the 22nd in Cairo.
    expect(dayKey(at("2026-11-21T23:30:00Z"), TZ)).toBe("2026-11-22");
    expect(dayBefore("2026-03-01", 1)).toBe("2026-02-28");
    expect(dayBefore("2026-01-01", 1)).toBe("2025-12-31");
  });

  it("sums today and the last seven days, oldest first", () => {
    const now = at("2026-11-22T10:00:00Z");
    const s = trackerStats(
      [
        { amount: 2, at: at("2026-11-22T06:00:00Z") },
        { amount: 1, at: at("2026-11-22T09:00:00Z") },
        { amount: 8, at: at("2026-11-21T12:00:00Z") },
        { amount: 4, at: at("2026-11-16T12:00:00Z") },
        { amount: 9, at: at("2026-11-10T12:00:00Z") },
      ],
      TZ,
      now,
      { goal: 8, streaks: true },
    );
    expect(s.today).toBe(3);
    expect(s.week).toEqual([4, 0, 0, 0, 0, 8, 3]);
  });

  it("counts a streak of days that met the goal, and keeps it alive while today is in progress", () => {
    const now = at("2026-11-22T10:00:00Z");
    const day = (d: number, amount: number) => ({ amount, at: at(`2026-11-${String(d).padStart(2, "0")}T12:00:00Z`) });
    expect(trackerStats([day(21, 8), day(20, 9), day(19, 8), day(18, 3)], TZ, now, { goal: 8, streaks: true }).streak).toBe(3);
    expect(trackerStats([day(22, 8), day(21, 8)], TZ, now, { goal: 8, streaks: true }).streak).toBe(2);
    expect(trackerStats([day(20, 8)], TZ, now, { goal: 8, streaks: true }).streak).toBe(0);
    expect(trackerStats([day(22, 1), day(21, 1)], TZ, now, { goal: null, streaks: true }).streak).toBe(2);
    expect(trackerStats([day(22, 300), day(21, 100)], TZ, now, { goal: null, streaks: false }).streak).toBe(0);
  });
});
