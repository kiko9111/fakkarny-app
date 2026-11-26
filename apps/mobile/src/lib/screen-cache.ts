/**
 * The last good copy of server-only screens (circles, a circle's feed, Daftar, money, tasks,
 * trackers, splits), so they draw at once from the phone and refresh behind. Pure: the store is
 * injected (the app passes its SQLite-backed localStorage). Wiped with the rest of the phone's
 * data on sign-out or account deletion (db/reset.ts).
 *
 * Kept in memory first (2026-11-26). A screen that opens reads its copy from memory, already
 * parsed: no storage read, no JSON parse, no zod parse, and the very same object as last time
 * while the server's answer has not changed, so React skips the redraw. Writes to storage happen
 * a moment later, together, and only for answers that really changed (`later`): they used to be
 * three storage writes on the tap's own thread for every one of ~20 background loads.
 */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ScreenCacheOptions {
  /** How many screens are kept; the least recently saved go first. */
  max?: number;
  /** Runs the storage write a little later (the app batches them). Default: at once. */
  later?: (save: () => void) => void;
  now?: () => number;
}

const PREFIX = "screen:";
const INDEX = "screen-index";

interface Entry {
  /** The answer as text, exactly as the server sent it: what is compared and what is saved. */
  text: string;
  raw: unknown;
  rawReady: boolean;
  /** The last parse of it, reused while the text and the parser are the same. */
  by: unknown;
  value: unknown;
  /** When the server last confirmed this text; 0 for a copy read from the phone or made stale. */
  at: number;
}

/** A parse that was already made of an answer: its JSON, the parser used, and what it returned. */
export interface Parsed {
  raw: unknown;
  by?: unknown;
  value?: unknown;
}

export function createScreenCache(store: KeyValueStore, options: number | ScreenCacheOptions = {}) {
  const opts = typeof options === "number" ? { max: options } : options;
  const max = opts.max ?? 80;
  const now = opts.now ?? Date.now;
  const later = opts.later ?? ((save: () => void) => save());

  const safe = <T>(fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };

  const entries = new Map<string, Entry>();
  /** Keys known to have no saved copy, so a miss costs one storage read, not one per draw. */
  const missing = new Set<string>();
  const dirty = new Set<string>();
  const gone = new Set<string>();
  let order: string[] | null = null;
  let orderDirty = false;
  let scheduled = false;

  const readOrder = (): string[] => (order ??= safe(() => JSON.parse(store.getItem(INDEX) ?? "[]") as string[], []));

  const entry = (key: string): Entry | null => {
    const held = entries.get(key);
    if (held) return held;
    if (missing.has(key)) return null;
    const text = safe(() => store.getItem(PREFIX + key), null);
    if (text === null) {
      missing.add(key);
      return null;
    }
    const e: Entry = { text, raw: undefined, rawReady: false, by: undefined, value: undefined, at: 0 };
    entries.set(key, e);
    return e;
  };

  const flush = () => {
    scheduled = false;
    for (const key of gone) safe(() => store.removeItem(PREFIX + key), undefined);
    gone.clear();
    for (const key of dirty) {
      const e = entries.get(key);
      if (e) safe(() => store.setItem(PREFIX + key, e.text), undefined);
    }
    dirty.clear();
    if (orderDirty) {
      orderDirty = false;
      safe(() => store.setItem(INDEX, JSON.stringify(readOrder())), undefined);
    }
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    later(flush);
  };

  /** Newest first; whatever falls off the end is dropped from the phone. */
  const moveToFront = (key: string) => {
    const list = readOrder();
    if (list[0] === key) return;
    const next = [key, ...list.filter((k) => k !== key)];
    for (const old of next.splice(max)) {
      entries.delete(old);
      dirty.delete(old);
      gone.add(old);
      missing.add(old);
    }
    order = next;
    orderDirty = true;
  };

  const write = (key: string, text: string, fresh: boolean, known?: Parsed): boolean => {
    const held = entry(key);
    if (held && held.text === text) {
      held.at = fresh ? now() : held.at;
      // Still in use though unchanged: a screen that rarely changes (the profile) must not
      // drift to the end of the list and be the first one dropped. Only from the far half, so
      // an unchanged refresh of every tab does not rewrite the list each time.
      if (readOrder().indexOf(key) >= max / 2) {
        moveToFront(key);
        schedule();
      }
      return false;
    }
    entries.set(key, { text, raw: known?.raw, rawReady: known !== undefined, by: known?.by, value: known?.value, at: fresh ? now() : 0 });
    missing.delete(key);
    gone.delete(key);
    dirty.add(key);
    moveToFront(key);
    schedule();
    return true;
  };

  function read<T>(key: string, parse: (raw: unknown) => T): T | null {
    const e = entry(key);
    if (!e) return null;
    if (e.by === parse) return e.value as T;
    if (!e.rawReady) {
      e.raw = JSON.parse(e.text);
      e.rawReady = true;
    }
    const value = parse(e.raw);
    e.by = parse;
    e.value = value;
    return value;
  }

  return {
    /** The saved copy, run through `parse` (the same zod parse as a fresh reply); null when none or it no longer parses. */
    get<T>(key: string, parse: (raw: unknown) => T): T | null {
      return safe(() => read(key, parse), null);
    },
    /** Like `get`, but a copy that does not parse throws (for an answer that just arrived). */
    read,
    /** Keep a value the phone made or was handed (a write's answer). Does not count as a fresh server read. */
    set(key: string, raw: unknown) {
      safe(() => write(key, JSON.stringify(raw), false, { raw }), false);
    },
    /**
     * Keep an answer that just came from the server, as its text. True when it differs from the
     * copy held (false: nothing to redraw, nothing to save; it only counts as fresh again).
     * `fresh: false` keeps it without counting it as a fresh read (something changed while it was
     * on its way). `parsed` hands over a parse already made, so it is not made twice.
     */
    put(key: string, text: string, how: { fresh?: boolean; parsed?: Parsed } = {}): boolean {
      return safe(() => write(key, text, how.fresh !== false, how.parsed), false);
    },
    /** The saved text itself, or null. */
    text(key: string): string | null {
      return entry(key)?.text ?? null;
    },
    /** How long ago the server confirmed this copy, in ms (Infinity: never, or made stale since). */
    age(key: string): number {
      const at = entries.get(key)?.at ?? 0;
      return at > 0 ? now() - at : Infinity;
    },
    /** Something changed on the server: no copy counts as fresh until it is read again. */
    stale() {
      for (const e of entries.values()) e.at = 0;
    },
    remove(key: string) {
      entries.delete(key);
      missing.add(key);
      dirty.delete(key);
      gone.add(key);
      const list = readOrder();
      if (list.includes(key)) {
        order = list.filter((k) => k !== key);
        orderDirty = true;
      }
      schedule();
    },
    clear() {
      safe(() => {
        // Also the copies dropped a moment ago whose removal was still waiting to be written.
        for (const k of new Set([...readOrder(), ...entries.keys(), ...gone])) store.removeItem(PREFIX + k);
        store.removeItem(INDEX);
      }, undefined);
      entries.clear();
      missing.clear();
      dirty.clear();
      gone.clear();
      order = [];
      orderDirty = false;
    },
    /** Write what waits to storage now (the app is leaving the foreground). */
    flush,
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
