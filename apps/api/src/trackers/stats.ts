import { toLocalIso } from "../lib/time";

/** Pure tracker maths: days are the user's local days, never UTC days. */
export interface EntryPoint {
  amount: number;
  at: Date;
}

export const dayKey = (at: Date, tz: string) => toLocalIso(at, tz).slice(0, 10);

/** The local day `back` days before `key` ("2026-11-22", 1 → "2026-11-21"). Calendar maths, so DST-safe. */
export function dayBefore(key: string, back: number): string {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d - back)).toISOString().slice(0, 10);
}

export interface TrackerStats {
  today: number;
  week: number[];
  /** The last 30 days, oldest first (the graph). */
  month: number[];
  streak: number;
}

/**
 * Today's sum, the last 7 days (oldest first) and the streak: days in a row that met the
 * daily goal (any entry when there is no goal). A day still in progress does not break it.
 */
export function trackerStats(entries: readonly EntryPoint[], tz: string, now: Date, opts: { goal: number | null; streaks: boolean }): TrackerStats {
  const perDay = new Map<string, number>();
  for (const e of entries) {
    const k = dayKey(e.at, tz);
    perDay.set(k, (perDay.get(k) ?? 0) + e.amount);
  }
  const today = dayKey(now, tz);
  const sum = (back: number) => perDay.get(dayBefore(today, back)) ?? 0;
  const met = (back: number) => (opts.goal === null ? sum(back) > 0 : sum(back) >= opts.goal);
  let streak = 0;
  if (opts.streaks) {
    for (let back = met(0) ? 0 : 1; back < 366 && met(back); back++) streak++;
  }
  const back = (n: number) => Array.from({ length: n }, (_, i) => n - 1 - i);
  return { today: sum(0), week: back(7).map(sum), month: back(30).map(sum), streak };
}
