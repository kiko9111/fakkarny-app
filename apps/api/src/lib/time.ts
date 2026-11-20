/**
 * Time-zone helpers built on Intl (no dependency). CLAUDE.md: store UTC, convert with
 * the user's IANA zone at the edges. "Local" strings are wall-clock "YYYY-MM-DDTHH:mm".
 */

export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function localParts(date: Date, tz: string): LocalParts {
  const parts = Object.fromEntries(formatter(tz).formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS.indexOf(parts.weekday ?? "Sun"),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-11-22T18:00" in the given zone. */
export function toLocalIso(date: Date, tz: string): string {
  const p = localParts(date, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** Offset of the zone from UTC at that instant, in ms (Cairo summer → +3h). */
function offsetMs(date: Date, tz: string): number {
  const p = localParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Wall-clock time in a zone → UTC instant. In a DST gap the time moves forward;
 * in an overlap the earlier instant wins.
 */
export function localToUtc(local: string, tz: string): Date {
  const m = LOCAL_RE.exec(local);
  if (!m) throw new Error(`Not a local datetime: ${local}`);
  const [, y, mo, d, h, mi, s] = m;
  const naive = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0));
  // Reject impossible values (Feb 30, 25:00) instead of letting Date roll them over.
  const check = new Date(naive);
  if (
    check.getUTCFullYear() !== Number(y) ||
    check.getUTCMonth() !== Number(mo) - 1 ||
    check.getUTCDate() !== Number(d) ||
    check.getUTCHours() !== Number(h) ||
    check.getUTCMinutes() !== Number(mi)
  ) {
    throw new Error(`Invalid local datetime: ${local}`);
  }
  // Two passes handle offsets that change around the target instant.
  let guess = naive - offsetMs(new Date(naive), tz);
  guess = naive - offsetMs(new Date(guess), tz);
  return new Date(guess);
}

/** "HH:MM" → minutes after midnight. */
export const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Is the instant inside the user's waking hours? Handles sleep after midnight. */
export function isAwake(date: Date, tz: string, wake: string, sleep: string): boolean {
  const p = localParts(date, tz);
  const now = p.hour * 60 + p.minute;
  const w = minutesOf(wake);
  const s = minutesOf(sleep);
  return w <= s ? now >= w && now < s : now >= w || now < s;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Human-readable local "now" for the model, e.g. "Thursday 2026-11-19 14:05 (Africa/Cairo)". */
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * The next `days` local dates with their weekday names, starting today, e.g.
 * "today Thursday 2026-11-19, tomorrow Friday 2026-11-20, Saturday 2026-11-21, …".
 * Given to the model so it looks weekdays up instead of doing date arithmetic.
 */
export function describeUpcomingDays(date: Date, tz: string, days = 14): string {
  const p = localParts(date, tz);
  return Array.from({ length: days }, (_, i) => {
    // Calendar arithmetic on the local date (noon UTC avoids any DST edge).
    const d = new Date(Date.UTC(p.year, p.month - 1, p.day + i, 12));
    const label = `${DAY_NAMES[d.getUTCDay()]} ${d.toISOString().slice(0, 10)}`;
    return i === 0 ? `today ${label}` : i === 1 ? `tomorrow ${label}` : label;
  }).join(", ");
}

export function describeNow(date: Date, tz: string): string {
  const names = DAY_NAMES;
  const p = localParts(date, tz);
  return `${names[p.weekday]} ${toLocalIso(date, tz).replace("T", " ")} (${tz})`;
}
