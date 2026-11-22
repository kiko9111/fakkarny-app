import "./storage";

/**
 * Small synchronous preferences (backed by expo-sqlite's localStorage), readable at startup
 * before any screen renders — e.g. the language, which decides RTL.
 */
/**
 * `pending_invite`: an invite code opened before onboarding finished; joined right after.
 * `offer_tracker`: set at sign-up so the first-tracker picker shows once.
 */
export type PrefKey = "language" | "always_direct" | "onboarded" | "pending_invite" | "offer_tracker";

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
    for (const k of ["language", "always_direct", "onboarded", "pending_invite", "offer_tracker"] as const) localStorage.removeItem(`pref:${k}`);
  },
};
