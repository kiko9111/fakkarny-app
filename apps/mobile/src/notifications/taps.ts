/**
 * Done and Later answered once. Android hands a tap on Done or Later to the app's listener while
 * the app runs; tapped while the app was stopped, the answer waits in the app's process until the
 * app opens and is read at start (`getLastNotificationResponse`). The same tap can be seen both
 * ways (it is still the "last answer" after an update reloads the app), so each one is remembered
 * by the notification, when it was shown and the button. Pure.
 */

/** How many answered taps are remembered: far more than can wait between two opens of the app. */
export const TAPS_KEPT = 30;

export function tapKey(identifier: string, shownAt: number, button: string): string {
  return `${identifier}|${shownAt}|${button}`;
}

/** The remembered taps from storage; anything unreadable counts as none. */
export function readTaps(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const list: unknown = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}

/** `taps` with `key` added as the newest, keeping the last TAPS_KEPT. */
export function rememberTap(taps: readonly string[], key: string): string[] {
  return [...taps.filter((k) => k !== key), key].slice(-TAPS_KEPT);
}
