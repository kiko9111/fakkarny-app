/** At most one background load per minute, and never two at once. */
export const PREFETCH_EVERY_MS = 60_000;

/** After a change (a chat reply, a card tap), saved copies refresh sooner, but not in a storm. */
export const PREFETCH_AFTER_CHANGE_MS = 5_000;

/** Background loads at once: the phone sends about 5 requests to one server at a time, so chat keeps a free slot. */
export const PREFETCH_AT_ONCE = 2;

/** After a reply, wait this long before refreshing saved copies: people often type again right away. */
export const PREFETCH_AFTER_CHAT_MS = 4_000;

export function planPrefetch(s: { now: number; last: number; running: boolean; changed?: boolean }): boolean {
  return !s.running && s.now - s.last >= (s.changed ? PREFETCH_AFTER_CHANGE_MS : PREFETCH_EVERY_MS);
}
