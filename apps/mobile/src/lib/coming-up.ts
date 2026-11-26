import type { Item } from "@fakkarni/shared";

/** A plan whose time passed less than this long ago is still "coming up": it is happening now. */
export const STILL_NOW_MS = 60 * 60_000;

/** A plan's times in ms: when Zaki reminds and when it is due (either may be missing). */
const timesOf = (i: Pick<Item, "remind_at" | "due_at">): number[] =>
  [i.remind_at, i.due_at].flatMap((at) => {
    const ms = at ? Date.parse(at) : Number.NaN;
    return Number.isFinite(ms) ? [ms] : [];
  });

/**
 * When a plan sorts: the first of its times from `from` on (Zaki's reminder until it has passed,
 * then the plan's own time), or the latest of them once every one has passed. Null with no time.
 * A plan is "passed" only when all of its times are: the persona reminds an hour or a day before a
 * plan, and ordering by the reminder alone dropped a plan still ahead (tomorrow's dentist) behind
 * the plans with no time an hour after the reminder, where Today's five places could hide it.
 */
function sortTime(i: Pick<Item, "remind_at" | "due_at">, from: number): { at: number; passed: boolean } | null {
  const times = timesOf(i);
  if (!times.length) return null;
  const ahead = times.filter((t) => t >= from);
  return ahead.length ? { at: Math.min(...ahead), passed: false } : { at: Math.max(...times), passed: true };
}

/** Repeating reminders: the server keeps their reminder time on the next occurrence. */
const firstTime = (i: Pick<Item, "remind_at" | "due_at">) => {
  const ms = Date.parse(i.remind_at ?? i.due_at ?? "");
  return Number.isFinite(ms) ? ms : Number.MAX_SAFE_INTEGER;
};

/**
 * The Today screen's "Coming up": one-off plans from now on, soonest first, then plans with no
 * time, then plans whose times have all passed (the latest first). One-off reminders stay open
 * after they ring until the user says they are done, so old ones used to fill the five places and a
 * plan the user had just asked for only raised the "+N". Repeating reminders (daily prayers,
 * medicine) have their own short list for the same reason.
 */
export function comingUp(items: Item[], now: Date, max = 5): { soon: Item[]; repeating: Item[]; more: number } {
  const from = now.getTime() - STILL_NOW_MS;
  const ahead: { item: Item; at: number }[] = [];
  const untimed: Item[] = [];
  const passed: { item: Item; at: number }[] = [];
  const again: Item[] = [];
  for (const item of items) {
    if (item.repeat_every_minutes) {
      again.push(item);
      continue;
    }
    const time = sortTime(item, from);
    if (!time) untimed.push(item);
    else (time.passed ? passed : ahead).push({ item, at: time.at });
  }
  ahead.sort((a, b) => a.at - b.at);
  passed.sort((a, b) => b.at - a.at);
  again.sort((a, b) => firstTime(a) - firstTime(b));
  const soon = [...ahead.map((p) => p.item), ...untimed, ...passed.map((p) => p.item)].slice(0, max);
  const repeating = again.slice(0, max);
  return { soon, repeating, more: items.length - soon.length - repeating.length };
}
