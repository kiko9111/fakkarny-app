/** At most one background load per minute, and never two at once. */
export const PREFETCH_EVERY_MS = 60_000;

export function planPrefetch(s: { now: number; last: number; running: boolean }): boolean {
  return !s.running && s.now - s.last >= PREFETCH_EVERY_MS;
}
