import { describe, expect, it } from "vitest";
import { parseStreak, recordDay, streakOf } from "./streak";

const range = (from: string, n: number) => Array.from({ length: n }, (_, i) => new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));

describe("streak", () => {
  it("counts days in a row, from yesterday while today is open", () => {
    const days = range("2026-11-20", 3); // 20, 21, 22
    expect(streakOf(days, "2026-11-22")).toEqual({ count: 3, activeToday: true, skipsUsed: 0 });
    expect(streakOf(days, "2026-11-23")).toEqual({ count: 3, activeToday: false, skipsUsed: 0 });
    expect(streakOf(days, "2026-11-25").count).toBe(0);
    expect(streakOf([], "2026-11-25").count).toBe(0);
  });
  it("forgives one missed day a week, not two in a row", () => {
    expect(streakOf(["2026-11-18", "2026-11-19", "2026-11-21", "2026-11-22"], "2026-11-22")).toEqual({ count: 4, activeToday: true, skipsUsed: 1 });
    expect(streakOf(["2026-11-18", "2026-11-19", "2026-11-22"], "2026-11-22").count).toBe(1);
    // Two skips 3 days apart: only the newer one is forgiven.
    expect(streakOf(["2026-11-15", "2026-11-17", "2026-11-18", "2026-11-20"], "2026-11-20").count).toBe(3);
    // Two skips 8 days apart are both forgiven.
    const days = [...range("2026-11-01", 3), ...range("2026-11-05", 7), ...range("2026-11-13", 2)];
    expect(streakOf(days, "2026-11-14")).toEqual({ count: 12, activeToday: true, skipsUsed: 2 });
  });
  it("celebrates each milestone once per streak", () => {
    let s = parseStreak(JSON.stringify({ days: range("2026-11-20", 2), celebrated: [] }));
    let r = recordDay(s, "2026-11-22");
    expect(r.milestone).toBe(3);
    r = recordDay(r.state, "2026-11-22");
    expect(r.milestone).toBeNull();
    // The streak ends; a new one celebrates 3 again.
    s = r.state;
    s = recordDay(s, "2026-12-01").state;
    s = recordDay(s, "2026-12-02").state;
    expect(recordDay(s, "2026-12-03").milestone).toBe(3);
  });
  it("survives bad saved data", () => {
    expect(parseStreak("nope")).toEqual({ days: [], celebrated: [] });
    expect(parseStreak(JSON.stringify({ days: ["x", "2026-11-01"], celebrated: [3, "a"] }))).toEqual({ days: ["2026-11-01"], celebrated: [3] });
  });
});
