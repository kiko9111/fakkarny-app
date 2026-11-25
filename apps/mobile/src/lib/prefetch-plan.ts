/** At most one background load per minute, and never two at once. */
export const PREFETCH_EVERY_MS = 60_000;

/** After a change (a chat reply, a card tap), saved copies refresh sooner, but not in a storm. */
export const PREFETCH_AFTER_CHANGE_MS = 5_000;

export function planPrefetch(s: { now: number; last: number; running: boolean; changed?: boolean }): boolean {
  return !s.running && s.now - s.last >= (s.changed ? PREFETCH_AFTER_CHANGE_MS : PREFETCH_EVERY_MS);
}
