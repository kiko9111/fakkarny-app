import type { Item } from "@fakkarni/shared";

/** A plan whose time passed less than this long ago is still "coming up": it is happening now. */
export const STILL_NOW_MS = 60 * 60_000;

const timeOf = (i: Pick<Item, "remind_at" | "due_at">) => {
  const at = i.remind_at ?? i.due_at;
  return at ? new Date(at).getTime() : null;
};

/**
 * The Today screen's "Coming up": one-off plans from now on, soonest first, then plans with no
 * time, then plans whose time has passed (the latest first). One-off reminders stay open after
 * they ring until the user says they are done, so old ones used to fill the five places and a
 * plan the user had just asked for only raised the "+N". Repeating reminders (daily prayers,
 * medicine) have their own short list for the same reason.
 */
export function comingUp(items: Item[], now: Date, max = 5): { soon: Item[]; repeating: Item[]; more: number } {
  const from = now.getTime() - STILL_NOW_MS;
  const ahead: Item[] = [];
  const untimed: Item[] = [];
  const passed: Item[] = [];
  const again: Item[] = [];
  for (const item of items) {
    const at = timeOf(item);
    if (item.repeat_every_minutes) again.push(item);
    else if (at === null) untimed.push(item);
    else if (at >= from) ahead.push(item);
    else passed.push(item);
  }
  const soonest = (a: Item, b: Item) => (timeOf(a) ?? Number.POSITIVE_INFINITY) - (timeOf(b) ?? Number.POSITIVE_INFINITY);
  ahead.sort(soonest);
  passed.sort((a, b) => soonest(b, a));
  again.sort(soonest);
  const soon = [...ahead, ...untimed, ...passed].slice(0, max);
  const repeating = again.slice(0, max);
  return { soon, repeating, more: items.length - soon.length - repeating.length };
}
