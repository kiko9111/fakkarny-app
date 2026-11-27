import { cacheRefreshed } from "./signals";
import { getCircle, getCircleFeed, getCircleTrackers, getMe, getMoney, getPocketMoney, listCircles, listGameyas, listLists, listDaftar, listMemories, listSplits, listTasks, listTrackers, refreshAll } from "./api";
import { PREFETCH_AT_ONCE, PREFETCH_AFTER_CHAT_MS, planPrefetch } from "./prefetch-plan";

let last = 0;
let running = false;
/** A chat message is being sent and answered: background loads wait (see setChatBusy). */
let chatBusy = false;
let deferred = false;

/**
 * Loads every tab in the background (app start, coming back to the app, back online), so each
 * screen opens at once from its saved copy with fresh numbers. Failures are quiet: the screen
 * still refreshes itself when opened.
 *
 * One request brings every tab (GET /bootstrap, lib/api.ts `refreshAll`). A server that does not
 * have it yet gets the screens one by one, as before: chat comes first there, because the phone
 * sends only a few requests to one server at a time, so twenty background loads right after a
 * reply used to make the next message wait behind them. They go a couple at a time, never while
 * a message is on its way, and stop as soon as one is sent.
 */
export function prefetchAll(now = Date.now(), changed = false): void {
  if (chatBusy) {
    deferred = true;
    return;
  }
  if (!planPrefetch({ now, last, running, changed })) return;
  last = now;
  running = true;
  const quiet = <T>(p: () => Promise<T>) => () => p().then((v) => v as T | null).catch(() => null);
  void (async () => {
    if (await refreshAll()) return;
    const first = [quiet(listCircles), quiet(getMe), quiet(listTasks), quiet(listTrackers), quiet(listDaftar), quiet(getMoney), quiet(listSplits), quiet(listMemories), quiet(getPocketMoney), quiet(listLists), quiet(listGameyas)];
    const [circles] = (await inTurns(first)) as [Awaited<ReturnType<typeof listCircles>> | null];
    // What reads the saved copies without asking (the Today tab's badge) looks again.
    cacheRefreshed.emit();
    // Each circle the user is in (detail, feed and shared trackers).
    const more = (circles ?? []).slice(0, 8).flatMap((c) => [quiet(() => getCircle(c.id)), quiet(() => getCircleFeed(c.id)), quiet(() => getCircleTrackers(c.id))]);
    await inTurns(more);
  })().finally(() => {
    running = false;
  });
}

/** Run loads PREFETCH_AT_ONCE at a time; stop starting new ones once a chat message is being sent. */
async function inTurns(jobs: (() => Promise<unknown>)[]): Promise<unknown[]> {
  const out: unknown[] = new Array(jobs.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < jobs.length && !chatBusy) {
      const i = next++;
      out[i] = await jobs[i]!();
    }
  };
  await Promise.all(Array.from({ length: Math.min(PREFETCH_AT_ONCE, jobs.length) }, worker));
  if (chatBusy && next < jobs.length) deferred = true;
  return out;
}

/** The outbox started or finished sending (syncBusy). Loads skipped meanwhile run a little after. */
export function setChatBusy(busy: boolean): void {
  chatBusy = busy;
  if (!busy && deferred) {
    deferred = false;
    later(PREFETCH_AFTER_CHAT_MS);
  }
}

let soon: ReturnType<typeof setTimeout> | null = null;
function later(ms: number) {
  if (soon) clearTimeout(soon);
  soon = setTimeout(() => {
    soon = null;
    prefetchAll(Date.now(), true);
  }, ms);
}

/**
 * Something changed on the server (Zaki logged money, a card was tapped, news arrived): refresh
 * every saved copy a little after, so the next tab opened shows it, without getting in the way of
 * the next chat message.
 */
export function prefetchSoon(): void {
  later(PREFETCH_AFTER_CHAT_MS);
}
