const API_PORT = 3000;

/**
 * Where the phone finds the API.
 * 1. EXPO_PUBLIC_API_URL if set (staging/production builds).
 * 2. In development, the same machine that serves Metro (hostUri, e.g. "192.168.1.5:8081"),
 *    so Expo Go on a real phone reaches the API on your laptop.
 * 3. localhost as a last resort (simulators).
 */
export function resolveApiUrl(opts: { envUrl?: string; hostUri?: string | null }): string {
  if (opts.envUrl) return opts.envUrl.replace(/\/+$/, "");
  const host = opts.hostUri?.split(":")[0];
  return `http://${host || "localhost"}:${API_PORT}`;
}

/** Public Terms / Privacy page on the API, in the app's language. */
export function legalUrl(apiUrl: string, doc: "terms" | "privacy", language: string): string {
  return `${apiUrl}/legal/${doc}?lang=${language === "en" ? "en" : "ar"}`;
}
