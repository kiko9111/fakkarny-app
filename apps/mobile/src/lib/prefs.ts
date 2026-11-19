import "expo-sqlite/localStorage/install";

/**
 * Small synchronous preferences (backed by expo-sqlite's localStorage), readable at startup
 * before any screen renders — e.g. the language, which decides RTL.
 */
export type PrefKey = "language" | "always_direct" | "onboarded";

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
    for (const k of ["language", "always_direct", "onboarded"] as const) localStorage.removeItem(`pref:${k}`);
  },
};
