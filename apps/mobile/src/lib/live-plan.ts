/** How often an open screen re-reads the server while the app is in front. */
export const LIVE_EVERY_MS = 30_000;
/** Several changes in a row (reply + items + cards) cause one reload. */
export const LIVE_DEBOUNCE_MS = 300;

/** Poll only while the app is in front, and not sooner than LIVE_EVERY_MS after the last load. */
export function shouldPoll(s: { active: boolean; now: number; last: number }): boolean {
  return s.active && s.now - s.last >= LIVE_EVERY_MS;
}
