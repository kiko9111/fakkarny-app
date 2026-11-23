/**
 * Zaki streak (owner ask, 2026-11-23): days in a row you talked to Zaki. Super light: a count,
 * one free skip day per 7 days so a busy day never breaks it, and a warm line at a few
 * milestones. Never guilt: nothing is sent when a streak ends. Pure; days are local "YYYY-MM-DD".
 */
export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100] as const;
const KEEP_DAYS = 120;

export type StreakState = { days: string[]; celebrated: number[] };

export function parseStreak(raw: string | null | undefined): StreakState {
  try {
    const v = JSON.parse(raw ?? "") as Partial<StreakState>;
    const days = Array.isArray(v.days) ? v.days.filter((d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) : [];
    const celebrated = Array.isArray(v.celebrated) ? v.celebrated.filter((n) => typeof n === "number") : [];
    return { days: [...new Set(days)].sort().slice(-KEEP_DAYS), celebrated };
  } catch {
    return { days: [], celebrated: [] };
  }
}

const dayMs = 86_400_000;
const toNum = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / dayMs;

export type Streak = { count: number; activeToday: boolean; skipsUsed: number };

/**
 * Counts active days back from today (or from yesterday while today is still open). A single
 * missed day is forgiven when no other day was forgiven in the 7 days after it; two missed days
 * in a row end the streak. Skip days don't add to the count.
 */
export function streakOf(days: string[], today: string): Streak {
  const set = new Set(days.map(toNum));
  const t = toNum(today);
  const activeToday = set.has(t);
  let d = activeToday ? t : t - 1;
  let count = 0;
  let skipsUsed = 0;
  let lastSkip = Infinity;
  for (;;) {
    if (set.has(d)) {
      count++;
      d--;
      continue;
    }
    if (count > 0 && set.has(d - 1) && lastSkip - d >= 7) {
      skipsUsed++;
      lastSkip = d;
      d--;
      continue;
    }
    break;
  }
  return { count, activeToday, skipsUsed };
}

/** Records today's activity. Returns the new state and a milestone to celebrate, if one was reached. */
export function recordDay(state: StreakState, today: string): { state: StreakState; milestone: number | null } {
  const days = state.days.includes(today) ? state.days : [...state.days, today].sort().slice(-KEEP_DAYS);
  const { count } = streakOf(days, today);
  // A new streak can celebrate again once the old one is gone.
  const celebrated = state.celebrated.filter((m) => m <= count);
  const milestone = STREAK_MILESTONES.find((m) => m === count && !celebrated.includes(m)) ?? null;
  return { state: { days, celebrated: milestone ? [...celebrated, milestone] : celebrated }, milestone };
}
