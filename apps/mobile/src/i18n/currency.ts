import { swapCurrencyWords, type Currency } from "@fakkarni/shared";

/**
 * The app's words with Egyptian pounds swapped for the currency of the user's city (pure). Run
 * once at start-up over every string; a change of city reloads the app. EGP gives back the same
 * object, so an Egyptian user's strings are untouched.
 */
export function withCurrency<T>(words: T, currency: Currency): T {
  if (currency.code === "EGP") return words;
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return swapCurrencyWords(v, currency);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    }
    return v;
  };
  return walk(words) as T;
}
