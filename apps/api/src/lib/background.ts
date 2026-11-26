/**
 * Work the answer doesn't wait for: counters for the dashboard, mostly. Every database round
 * trip a request waits for is time the person waits, so what nobody reads in the answer is
 * started and left to finish on its own. A failure is dropped, never thrown into the request.
 * Not for anything the app's behaviour depends on (allowance counts, safety flags): await those.
 */
export function inBackground(work: PromiseLike<unknown>): void {
  // Prisma starts a query only when it is awaited: `then` is what sends it.
  track(Promise.resolve(work).catch(() => {}));
}

/** Work started and not awaited by the request that started it, until it ends. */
const running = new Set<Promise<unknown>>();

/**
 * Lets the server's stop wait for `work` (a push to another person, a row for the dashboard)
 * before it closes the database pool. Returns `work` itself.
 */
export function track<T>(work: Promise<T>): Promise<T> {
  running.add(work);
  const done = () => running.delete(work);
  work.then(done, done);
  return work;
}

/**
 * Resolves when every tracked piece of work has ended, or after `ms`, whichever comes first.
 * Work that tracked work starts as it ends (a chat turn's push to another person, its rows for
 * the dashboard) is waited for as well: the set is read again until it is empty.
 */
export async function backgroundSettled(ms: number): Promise<void> {
  const until = Date.now() + ms;
  while (running.size > 0) {
    const left = until - Date.now();
    if (left <= 0) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.allSettled([...running]),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, left);
      }),
    ]);
    clearTimeout(timer);
  }
}

/** How many tracked pieces of work are still running (for tests). */
export function backgroundCount(): number {
  return running.size;
}
