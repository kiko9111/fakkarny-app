/**
 * Repeating reminders ("every hour drink water"). The server and the phone both compute
 * occurrences from the same anchor with this function, so the chat message and the
 * local notification land on the same minute without syncing.
 */
export const MIN_REPEAT_MINUTES = 15;
export const MAX_REPEAT_MINUTES = 7 * 24 * 60;

/**
 * Occurrences `anchor + k * every` strictly after `after`, skipping times when the user
 * is asleep (per `awake`), soonest first, at most `count`.
 */
export function nextOccurrences(
  anchor: Date,
  everyMinutes: number,
  after: Date,
  count: number,
  awake: (at: Date) => boolean = () => true,
): Date[] {
  const step = Math.max(MIN_REPEAT_MINUTES, Math.floor(everyMinutes)) * 60_000;
  const out: Date[] = [];
  // First k whose occurrence is after `after`.
  let k = Math.max(0, Math.floor((after.getTime() - anchor.getTime()) / step) + 1);
  // A week of quarter-hours is the most we ever need to scan to find an awake slot.
  for (let scanned = 0; out.length < count && scanned < 700; scanned++, k++) {
    const at = new Date(anchor.getTime() + k * step);
    if (awake(at)) out.push(at);
  }
  return out;
}

/** "HH:MM" wake/sleep window check on minutes after local midnight (sleep may be past midnight). */
export function awakeAtMinutes(minutesAfterMidnight: number, wake: string, sleep: string): boolean {
  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  const w = toMin(wake);
  const s = toMin(sleep);
  return w <= s ? minutesAfterMidnight >= w && minutesAfterMidnight < s : minutesAfterMidnight >= w || minutesAfterMidnight < s;
}
