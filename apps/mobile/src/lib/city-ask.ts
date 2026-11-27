/**
 * When Zaki asks for the user's city (pure). Once, after a few messages, so the first chat is
 * about what the user came for; never when a city is known or the server can't save one.
 * `count` is prefs "city_ask": a number of messages so far, or "done".
 */
export const CITY_ASK_AFTER = 3;

export function cityAskStep(count: string | null, known: { city: boolean; server: boolean }): { next: string | null; ask: boolean } {
  if (count === "done" || known.city) return { next: count === "done" ? "done" : count, ask: false };
  if (!known.server) return { next: count, ask: false };
  const n = (Number(count) || 0) + 1;
  return n >= CITY_ASK_AFTER ? { next: "done", ask: true } : { next: String(n), ask: false };
}
