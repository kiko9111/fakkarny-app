import { getCircle, getCircleFeed, getCircleTrackers, getMe, getMoney, listCircles, listDaftar, listMemories, listSplits, listTasks, listTrackers } from "./api";
import { planPrefetch } from "./prefetch-plan";

let last = 0;
let running = false;

/**
 * Loads every tab in the background (app start, coming back to the app, back online), so each
 * screen opens at once from its saved copy with fresh numbers. Failures are quiet: the screen
 * still refreshes itself when opened.
 */
export function prefetchAll(now = Date.now(), changed = false): void {
  if (!planPrefetch({ now, last, running, changed })) return;
  last = now;
  running = true;
  void (async () => {
    const quiet = <T>(p: Promise<T>) => p.then((v) => v as T | null).catch(() => null);
    const [circles] = await Promise.all([
      quiet(listCircles()),
      quiet(getMe()),
      quiet(listTasks()),
      quiet(listTrackers()),
      quiet(listDaftar()),
      quiet(getMoney()),
      quiet(listSplits()),
      quiet(listMemories()),
    ]);
    // Each circle the user is in, a few at a time (detail, feed and shared trackers).
    for (const c of (circles ?? []).slice(0, 8)) {
      await Promise.all([quiet(getCircle(c.id)), quiet(getCircleFeed(c.id)), quiet(getCircleTrackers(c.id))]);
    }
  })().finally(() => {
    running = false;
  });
}

let soon: ReturnType<typeof setTimeout> | null = null;
/**
 * Something changed on the server (Zaki logged money, a card was tapped, news arrived): refresh
 * every saved copy shortly after, so the next tab opened shows it straight away, not the old copy.
 */
export function prefetchSoon(): void {
  if (soon) clearTimeout(soon);
  soon = setTimeout(() => {
    soon = null;
    prefetchAll(Date.now(), true);
  }, 800);
}
