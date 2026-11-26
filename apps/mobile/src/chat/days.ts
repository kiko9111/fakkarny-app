/**
 * The line between days in the chat (pure). The first message of a local day gets the day
 * above it: Today, Yesterday, the weekday for the last week, then the date.
 */

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** The local calendar day of a moment, or null when it has no real time (Zaki's first greeting). */
export function dayOf(iso: string | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  const at = d.getTime();
  return Number.isFinite(at) && at > 0 ? startOfDay(d) : null;
}

/** True for the first message of its day: the one before it is from another day, or there is none. */
export function opensDay(iso: string, before: string | undefined): boolean {
  const day = dayOf(iso);
  return day !== null && day !== dayOf(before);
}

/**
 * What the line says. A message dated after today (a phone clock running behind the server's)
 * reads as today: nothing in the chat is from tomorrow.
 */
export function dayLabel(iso: string, now: Date, words: { today: string; yesterday: string }, locale: string): string {
  const d = new Date(iso);
  // Rounded: a day is 23 or 25 hours long when the clocks change.
  const ago = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (ago <= 0) return words.today;
  if (ago === 1) return words.yesterday;
  if (ago < 7) return d.toLocaleDateString(locale, { weekday: "long" });
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(locale, sameYear ? { weekday: "short", day: "numeric", month: "long" } : { day: "numeric", month: "long", year: "numeric" });
}
