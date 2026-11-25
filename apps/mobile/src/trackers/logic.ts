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

/** Bar heights (0..1) for the 30-day graph, scaled like the week strip. */
export function monthBars(t: Pick<Tracker, "month" | "goal" | "cumulative">): number[] {
  if (!t.month.length) return [];
  const top = Math.max(...t.month, !t.cumulative && t.goal ? t.goal : 0);
  return t.month.map((v) => (top > 0 ? v / top : 0));
}

/** Times offered in the builder for Zaki's "did you?" questions. */
export const ASK_TIME_CHOICES = ["08:00", "13:00", "18:00", "21:00"] as const;
export const MAX_ASK = 3;

/** Tap a time on or off; at most MAX_ASK, kept in order. */
export function toggleAskTime(times: readonly string[], time: string): string[] {
  if (times.includes(time)) return times.filter((x) => x !== time);
  if (times.length >= MAX_ASK) return [...times];
  return [...times, time].sort();
}

/** "21:00" → "9:00 PM" style, in the phone's own locale. */
export function askTimeLabel(time: string, locale: string): string {
  const [h, m] = time.split(":").map(Number) as [number, number];
  return new Date(2026, 0, 1, h, m).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

const WANT = /(?:عايز|عاوز|عايزة|عاوزة|نفسي|محتاج|محتاجة|ناوي|ناوية|هحاول|لازم)\s+(?:إني|اني|أني|ان|أن)?\s*(?:[أا]?(?:تعود|بدأ|بدا))?\s*(?:على|علي)?\s*(.{2,40}?)\s+(?:كل\s+يوم|يوميا|يومياً)/;
const WANT_EN = /\bi\s+(?:want|need|wanna|plan|am going|'m going|should)\s+(?:to\s+)?(?:start\s+|get\s+into\s+|build\s+a\s+habit\s+of\s+)?(.{2,40}?)\s+(?:every\s*day|daily|each\s+day)\b/i;

/**
 * "عايز أتعود على القراية كل يوم" → "القراية": a habit the user wants, so the chat can offer a
 * tracker with one tap. Rules only (no AI call); returns null for anything less clear.
 */
export function suggestTracker(text: string): string | null {
  const m = text.match(WANT) ?? text.match(WANT_EN);
  const name = m?.[1]?.replace(/^(?:to|a|the)\s+/i, "").replace(/[.,!?؟،]+$/, "").trim();
  if (!name || name.length < 2 || /\d{3,}/.test(name)) return null;
  return name;
}

/**
 * What a tracker looks like right after logging `amount`, drawn at once while the server
 * confirms (its reply then replaces this guess; a failure puts the old one back).
 */
export function bumpTracker<T extends Pick<Tracker, "today" | "total" | "week" | "month">>(t: T, amount = 1): T {
  const week = [...t.week];
  week[week.length - 1] = (week[week.length - 1] ?? 0) + amount;
  const month = [...t.month];
  if (month.length) month[month.length - 1] = (month[month.length - 1] ?? 0) + amount;
  return { ...t, today: t.today + amount, total: t.total + amount, week, month };
}
