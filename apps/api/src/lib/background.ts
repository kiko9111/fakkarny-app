/**
 * Work the answer doesn't wait for: counters for the dashboard, mostly. Every database round
 * trip a request waits for is time the person waits, so what nobody reads in the answer is
 * started and left to finish on its own. A failure is dropped, never thrown into the request.
 * Not for anything the app's behaviour depends on (allowance counts, safety flags): await those.
 */
export function inBackground(work: PromiseLike<unknown>): void {
  // Prisma starts a query only when it is awaited: `then` is what sends it.
  void Promise.resolve(work).catch(() => {});
}
