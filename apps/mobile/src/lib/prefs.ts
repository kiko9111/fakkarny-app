import "./storage";

/**
 * Small synchronous preferences (backed by expo-sqlite's localStorage), readable at startup
 * before any screen renders — e.g. the language, which decides RTL.
 */
/**
 * `pending_invite`: an invite code opened before onboarding finished; joined right after.
 * `pending_referral`: a friend's personal invite code, claimed right after onboarding.
 * `offer_tracker`: set at sign-up so the first-tracker picker shows once.
 * `brain`: "phone" when Zaki's model runs on the phone (Android test mode), else the cloud.
 * `brain_model`: the chosen on-phone model id (src/brain/catalog.ts). `brain_fallback`: "0" turns
 * off the cloud fallback when the phone model fails. `brain_last_ms`: last on-phone reply time. `reply_last_ms`: last whole reply wait (send to reply).
 * `pending_forward`: a message shared to Zaki (or pasted) that the chat sends as soon as it is open.
 * `reply_stream`: "1" when the server last said it sends chat replies while they are written
 * (read and written by lib/api.ts under the same `pref:` name; it cannot import this file).
 */
export type PrefKey = "language" | "always_direct" | "onboarded" | "pending_invite" | "pending_referral" | "offer_tracker" | "theme" | "unlocked" | "streak" | "split_daftar" | "brain" | "brain_model" | "brain_fallback" | "brain_last_ms" | "reply_last_ms" | "reply_stream" | "pending_forward";

export const prefs = {
  get(key: PrefKey): string | null {
    try {
      return localStorage.getItem(`pref:${key}`);
    } catch {
      return null;
    }
  },
  set(key: PrefKey, value: string | null) {
    if (value === null) localStorage.removeItem(`pref:${key}`);
    else localStorage.setItem(`pref:${key}`, value);
  },
  clear() {
    for (const k of ["language", "always_direct", "onboarded", "pending_invite", "pending_referral", "offer_tracker", "theme", "unlocked", "pending_forward"] as const) localStorage.removeItem(`pref:${k}`);
  },
};
