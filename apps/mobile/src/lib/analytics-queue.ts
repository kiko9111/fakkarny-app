import type { AppEvent, AppEventName, AppEventProps } from "@fakkarni/shared";

/**
 * A small batching queue for product analytics. Pure: storage-free, transport injected, so it
 * is tested without React Native. Events are dropped (never retried forever) when sending fails
 * three times: analytics must never get in the way of the app.
 */
export interface AnalyticsQueueOptions {
  send: (events: AppEvent[]) => Promise<void>;
  now?: () => Date;
  /** Send when this many are waiting. */
  batchSize?: number;
  /** Keep at most this many while offline. */
  maxQueued?: number;
}

export function createAnalyticsQueue(opts: AnalyticsQueueOptions) {
  const now = opts.now ?? (() => new Date());
  const batchSize = opts.batchSize ?? 20;
  const maxQueued = opts.maxQueued ?? 200;
  let queue: AppEvent[] = [];
  let failures = 0;
  let sending = false;

  async function flush(): Promise<void> {
    if (sending || !queue.length) return;
    sending = true;
    const batch = queue.slice(0, 50);
    try {
      await opts.send(batch);
      queue = queue.slice(batch.length);
      failures = 0;
    } catch {
      failures++;
      if (failures >= 3) {
        queue = queue.slice(batch.length);
        failures = 0;
      }
    } finally {
      sending = false;
    }
  }

  function track(name: AppEventName, props: AppEventProps = {}) {
    queue.push({ name, props, at: now().toISOString() });
    if (queue.length > maxQueued) queue = queue.slice(queue.length - maxQueued);
    if (queue.length >= batchSize) void flush();
  }

  return { track, flush, pending: () => queue.length };
}

/** The route pattern of a path, with ids and codes replaced, so screens count together. */
export function routePattern(path: string): string {
  return (
    path
      .split("/")
      .map((part) => (/^[0-9a-f-]{16,}$/i.test(part) || /^[A-Z0-9]{5,}$/.test(part) || /^\d+$/.test(part) ? "[id]" : part))
      .join("/")
      .slice(0, 60) || "/"
  );
}
