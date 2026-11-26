import type { ScreenCache } from "./screen-cache";

/**
 * Reads of server-only screens through the saved copies (screen-cache.ts). Pure: the cache and
 * the transport are injected.
 *
 * What it adds over "fetch, parse, save":
 * - One request per path at a time: a screen and the background refresh asking for the same thing
 *   share one answer.
 * - A copy the server confirmed a moment ago (`freshMs`) is used as it is. Every tab's data
 *   arrives in one answer on start, on return to the app and after a change (`all`), so a tab
 *   opened right after needs no request of its own.
 * - An answer identical to the copy held costs nothing: no parse, no storage write, and the
 *   screen gets the same object back, so nothing redraws.
 * - Nothing is "fresh" across a change. Any write this phone makes, and any news of a change
 *   (`changed`), ends freshness; an answer that was already on its way then is kept but not
 *   trusted as fresh, and never replaces a newer one.
 * - A write's own answer goes straight into the copies that show it (`set`), so every screen has
 *   it before the next read; a read that was asked before it cannot undo it.
 */
export function createSavedReads(deps: {
  cache: ScreenCache;
  /** GET `path`, answering its body text; throws for anything but a good answer. */
  fetchText: (path: string) => Promise<string>;
  /** How long a server-confirmed copy is used without asking again. */
  freshMs: number;
}) {
  const { cache } = deps;
  /** Moves whenever something may have changed on the server. */
  let epoch = 0;
  let asked = 0;
  /** Per path: the request number of the answer held, so a slow old answer never replaces a newer one. */
  const held = new Map<string, number>();
  const flying = new Map<string, { epoch: number; done: Promise<void> }>();
  /** What the last full answer delivered, to know what "nothing changed" (304) covers. */
  let lastAll = new Map<string, string>();
  /** Requests numbered up to here were asked for someone who has since signed out (`forget`). */
  let forgotten = 0;

  /** Keep an answer unless a newer one is held. True when the copy changed. */
  const keep = (path: string, text: string, n: number, at: number, parsed?: { raw: unknown; by: unknown; value: unknown }): boolean => {
    if (n <= forgotten) return false;
    if ((held.get(path) ?? 0) > n) return false;
    held.set(path, n);
    return cache.put(path, text, { fresh: at === epoch, parsed });
  };

  return {
    /** The phone wrote something, or heard that something changed: every copy needs asking again. */
    changed() {
      epoch++;
      cache.stale();
    },

    /**
     * Signed out, or the account is gone: every copy is dropped, and an answer still on its way
     * for that person is never kept (it would hand their data to whoever signs in next).
     */
    forget() {
      epoch++;
      forgotten = asked;
      held.clear();
      flying.clear();
      lastAll = new Map();
      cache.clear();
    },

    /** The saved copy, or null (the same as the cache's `get`). */
    peek<T>(path: string, parse: (raw: unknown) => T): T | null {
      return cache.get(path, parse);
    },

    /**
     * Keep a value this phone made or was handed (a write's answer put into the list that shows
     * it). It is drawn at once, never counts as a fresh read, and an answer that was asked for
     * before it never replaces it.
     */
    set(path: string, raw: unknown) {
      held.set(path, ++asked);
      cache.set(path, raw);
    },

    /** The server's answer for `path`, through the saved copy. Throws when it can't be had or doesn't parse. */
    async get<T>(path: string, parse: (raw: unknown) => T): Promise<T> {
      if (cache.age(path) < deps.freshMs) {
        const fresh = cache.get(path, parse);
        if (fresh !== null) return fresh;
      }
      let flight = flying.get(path);
      if (!flight || flight.epoch !== epoch) {
        const n = ++asked;
        const at = epoch;
        const mine = {
          epoch,
          done: deps
            .fetchText(path)
            .then((text) => {
              if (cache.text(path) === text) return void keep(path, text, n, at);
              // An answer that does not parse is not kept: the last good copy stays.
              const raw: unknown = JSON.parse(text);
              keep(path, text, n, at, { raw, by: parse, value: parse(raw) });
            })
            .finally(() => {
              if (flying.get(path) === mine) flying.delete(path);
            }),
        };
        flying.set(path, mine);
        flight = mine;
      }
      await flight.done;
      const value = cache.read(path, parse);
      if (value === null) throw new Error(`no answer kept for ${path}`);
      return value;
    },

    /**
     * Every tab at once. `load` answers each path's body text, "same" when the server says
     * nothing changed since the last full answer, or null when it has no such route. Each part
     * is checked with its screen's own parser (`parserFor`) before it is kept, like a single
     * answer: one that does not fit leaves the last good copy alone, and a path with no parser is
     * skipped. Returns whether any saved copy changed (the screens in view should re-read), or
     * null for no route.
     */
    async all(load: () => Promise<Record<string, string> | "same" | null>, parserFor: (path: string) => ((raw: unknown) => unknown) | null): Promise<boolean | null> {
      const n = ++asked;
      const at = epoch;
      const parts = await load();
      if (parts === null) return null;
      if (parts === "same") {
        if (n <= forgotten) return false;
        // Fresh again, but only where the copy is still the one that answer delivered.
        for (const [path, text] of lastAll) if (cache.text(path) === text) keep(path, text, n, at);
        return false;
      }
      // Asked for someone who has since signed out: nothing of it is kept.
      if (n <= forgotten) return false;
      let differs = false;
      const delivered = new Map<string, string>();
      for (const [path, text] of Object.entries(parts)) {
        if (typeof text !== "string") continue;
        if (cache.text(path) === text) {
          delivered.set(path, text);
          keep(path, text, n, at);
          continue;
        }
        const parse = parserFor(path);
        if (!parse) continue;
        try {
          const raw: unknown = JSON.parse(text);
          const value = parse(raw);
          delivered.set(path, text);
          if (keep(path, text, n, at, { raw, by: parse, value })) differs = true;
        } catch {
          // Does not fit this build: the last good copy stays.
        }
      }
      lastAll = delivered;
      return differs;
    },
  };
}

export type SavedReads = ReturnType<typeof createSavedReads>;
