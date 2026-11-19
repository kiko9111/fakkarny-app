import type { PostMessageRequest, PostMessageResponse } from "@fakkarni/shared";

/**
 * Offline-first outbox (CLAUDE.md: "save to SQLite first, sync later with client IDs").
 * Pure logic: storage, transport and timers are injected so it can be unit-tested.
 *
 * - Messages are sent one at a time, oldest first, so the friend sees them in order.
 * - Offline / 5xx / 409 / 429 → stop and retry later with backoff (the order is kept).
 * - 402 → chat is locked (no subscription): keep everything queued, stop, and tell the UI
 *   to show the paywall. Messages go out once the user subscribes.
 * - Other 4xx → the server will never accept it; mark failed and move on.
 * - The server dedupes on client_id, so resending after a lost response is safe.
 */

export interface OutboxMessage extends PostMessageRequest {
  attempts: number;
}

export interface OutboxStore {
  /** Pending user messages, oldest first. */
  pending(): Promise<OutboxMessage[]>;
  markSynced(clientId: string, res: PostMessageResponse): Promise<void>;
  markAttempt(clientId: string): Promise<void>;
  markFailed(clientId: string): Promise<void>;
}

export class HttpError extends Error {
  constructor(public readonly status: number) {
    super(`HTTP ${status}`);
  }
}

export type Send = (msg: PostMessageRequest) => Promise<PostMessageResponse>;

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export type FlushOutcome = "idle" | "done" | "offline" | "retrying" | "locked";

export function isRetryable(err: unknown): boolean {
  if (err instanceof HttpError) return err.status >= 500 || err.status === 409 || err.status === 429 || err.status === 408;
  return true; // network errors, timeouts, aborted fetches
}

const BASE_DELAY_MS = 2_000;
const MAX_DELAY_MS = 5 * 60_000;
export const backoffMs = (attempts: number) => Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1));

export function createSyncQueue(deps: {
  store: OutboxStore;
  send: Send;
  timers?: Timers;
  /** Called when a flush starts/stops sending (drives the typing indicator). */
  onBusyChange?: (busy: boolean) => void;
  /** Called after any message changes state, so the UI can reload. */
  onChange?: () => void;
  /** Called with true when the server says chat is locked (402), false after a successful send. */
  onLockedChange?: (locked: boolean) => void;
}) {
  const timers: Timers = deps.timers ?? { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };
  let running: Promise<FlushOutcome> | null = null;
  let again = false;
  let retryHandle: unknown = null;

  const scheduleRetry = (attempts: number) => {
    if (retryHandle !== null) timers.clearTimeout(retryHandle);
    retryHandle = timers.setTimeout(() => {
      retryHandle = null;
      void flush();
    }, backoffMs(attempts));
  };

  async function runOnce(): Promise<FlushOutcome> {
    const pending = await deps.store.pending();
    if (pending.length === 0) return "idle";
    deps.onBusyChange?.(true);
    try {
      for (const msg of pending) {
        try {
          const { attempts: _attempts, ...body } = msg;
          const res = await deps.send(body);
          await deps.store.markSynced(msg.client_id, res);
          deps.onLockedChange?.(false);
          deps.onChange?.();
        } catch (err) {
          if (err instanceof HttpError && err.status === 402) {
            deps.onLockedChange?.(true);
            return "locked";
          }
          if (isRetryable(err)) {
            await deps.store.markAttempt(msg.client_id);
            deps.onChange?.();
            scheduleRetry(msg.attempts + 1);
            return err instanceof HttpError ? "retrying" : "offline";
          }
          await deps.store.markFailed(msg.client_id);
          deps.onChange?.();
        }
      }
      return "done";
    } finally {
      deps.onBusyChange?.(false);
    }
  }

  /** Send everything pending. Concurrent calls share one run; a call during a run triggers one more pass. */
  async function flush(): Promise<FlushOutcome> {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      let outcome: FlushOutcome;
      do {
        again = false;
        outcome = await runOnce();
      } while (again && outcome === "done");
      return outcome;
    })();
    try {
      return await running;
    } finally {
      running = null;
    }
  }

  /** Network came back or the app returned to the foreground: retry now instead of waiting. */
  function wake() {
    if (retryHandle !== null) {
      timers.clearTimeout(retryHandle);
      retryHandle = null;
    }
    return flush();
  }

  function stop() {
    if (retryHandle !== null) timers.clearTimeout(retryHandle);
    retryHandle = null;
  }

  return { flush, wake, stop };
}
export type SyncQueue = ReturnType<typeof createSyncQueue>;
