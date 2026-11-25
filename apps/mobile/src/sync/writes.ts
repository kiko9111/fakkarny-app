import { HttpError, isRetryable } from "./queue";

/**
 * Local-first writes for shared things (2026-11-25): a tap that changes something on the server
 * (log a tracker step, check in) is saved on the phone first when there is no connection, shown at
 * once, and sent when the network is back, oldest first. Each write carries its own key
 * (x-idempotency-key), so a retry after a lost answer is applied once. Pure: storage and transport
 * are injected (tested in writes.test.ts).
 */
export interface PendingWrite {
  id: string;
  method: "POST" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  /** When the user did it (the phone's clock), ISO. */
  at: string;
}

export interface WriteStore {
  load(): PendingWrite[];
  save(writes: PendingWrite[]): void;
}

/** A write that couldn't reach the server and waits on the phone. The UI keeps its guess. */
export class QueuedOffline extends Error {
  constructor() {
    super("queued offline");
  }
}

/** No answer at all (offline, timeout): worth keeping. A refusal from the server is not. */
export const isOffline = (err: unknown) => !(err instanceof HttpError) || err.status === 0;

/** Writes older than this are dropped instead of replayed (a stale tap from last week helps no one). */
export const MAX_AGE_MS = 3 * 86_400_000;
export const MAX_PENDING = 200;

export function createWriteOutbox(deps: { store: WriteStore; send: (w: PendingWrite) => Promise<void>; now?: () => number; onChange?: () => void }) {
  const now = deps.now ?? Date.now;
  let flushing: Promise<"done" | "offline"> | null = null;

  function enqueue(w: PendingWrite) {
    const all = [...deps.store.load(), w].slice(-MAX_PENDING);
    deps.store.save(all);
    deps.onChange?.();
  }

  async function run(): Promise<"done" | "offline"> {
    for (;;) {
      const all = deps.store.load();
      const fresh = all.filter((w) => now() - Date.parse(w.at) < MAX_AGE_MS);
      if (fresh.length !== all.length) deps.store.save(fresh);
      const next = fresh[0];
      if (!next) return "done";
      try {
        await deps.send(next);
      } catch (err) {
        // Offline, a server hiccup or busy: keep it, in order, and try on the next refresh.
        if (isRetryable(err)) return "offline";
        // Refused for good (gone, not allowed): drop it, carry on with the rest.
      }
      deps.store.save(deps.store.load().filter((w) => w.id !== next.id));
      deps.onChange?.();
    }
  }

  /** Send what waits. Concurrent calls share one run. */
  function flush() {
    if (!flushing) flushing = run().finally(() => (flushing = null));
    return flushing;
  }

  const pending = () => deps.store.load();
  return { enqueue, flush, pending };
}
