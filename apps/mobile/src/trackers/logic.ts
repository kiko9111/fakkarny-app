import type { Tracker } from "@fakkarni/shared";

/** Pure helpers for the trackers screens (unit-tested; no react-native imports). */

/** 0..1 towards the goal: today's count for daily goals, the running total for a savings target. */
export function progress(t: Pick<Tracker, "goal" | "cumulative" | "today" | "total">): number | null {
  if (!t.goal) return null;
  return Math.min(1, Math.max(0, (t.cumulative ? t.total : t.today) / t.goal));
}

/** Bar heights (0..1) for the 7-day strip, scaled to the best day (or the goal, if higher). */
export function weekBars(t: Pick<Tracker, "week" | "goal" | "cumulative">): number[] {
  const top = Math.max(...t.week, !t.cumulative && t.goal ? t.goal : 0);
  return t.week.map((v) => (top > 0 ? v / top : 0));
}

/** May this user add another tracker? `limit` null = no limit (Pro). */
export const canAdd = (count: number, limit: number | null) => limit === null || count < limit;

export const formatNumber = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
