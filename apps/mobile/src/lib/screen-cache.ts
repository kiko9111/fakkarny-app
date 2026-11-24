/**
 * The last good copy of server-only screens (circles, a circle's feed, Daftar, money, tasks,
 * trackers, splits), so they draw at once from the phone and refresh behind. Pure: the store is
 * injected (the app passes its SQLite-backed localStorage). Wiped with the rest of the phone's
 * data on sign-out or account deletion (db/reset.ts).
 */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const PREFIX = "screen:";
const INDEX = "screen-index";

export function createScreenCache(store: KeyValueStore, max = 80) {
  const safe = <T>(fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };
  const readIndex = (): string[] => safe(() => JSON.parse(store.getItem(INDEX) ?? "[]") as string[], []);
  return {
    /** The saved copy, run through `parse` (the same zod parse as a fresh reply); null when none or it no longer parses. */
    get<T>(key: string, parse: (raw: unknown) => T): T | null {
      return safe(() => {
        const raw = store.getItem(PREFIX + key);
        return raw === null ? null : parse(JSON.parse(raw));
      }, null);
    },
    set(key: string, raw: unknown) {
      safe(() => {
        store.setItem(PREFIX + key, JSON.stringify(raw));
        const index = [key, ...readIndex().filter((k) => k !== key)];
        for (const old of index.splice(max)) store.removeItem(PREFIX + old);
        store.setItem(INDEX, JSON.stringify(index));
      }, undefined);
    },
    remove(key: string) {
      safe(() => {
        store.removeItem(PREFIX + key);
        store.setItem(INDEX, JSON.stringify(readIndex().filter((k) => k !== key)));
      }, undefined);
    },
    clear() {
      safe(() => {
        for (const k of readIndex()) store.removeItem(PREFIX + k);
        store.removeItem(INDEX);
      }, undefined);
    },
  };
}

export type ScreenCache = ReturnType<typeof createScreenCache>;

/** Parses each entry on its own and drops the ones that don't fit, so one odd row never blanks a whole screen. */
export function eachValid<T>(parse: (x: unknown) => { success: true; data: T } | { success: false }, list: unknown): T[] {
  if (!Array.isArray(list)) return [];
  return list.flatMap((x) => {
    const r = parse(x);
    return r.success ? [r.data] : [];
  });
}
