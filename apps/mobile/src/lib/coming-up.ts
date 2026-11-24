import type { Item } from "@fakkarni/shared";

const when = (i: Pick<Item, "remind_at" | "due_at">) => {
  const at = i.remind_at ?? i.due_at;
  return at ? new Date(at).getTime() : Number.POSITIVE_INFINITY;
};

/**
 * The Today screen's "Coming up": one-off plans soonest first, and repeating reminders (daily
 * prayers, medicine) in their own short list, so five of those can never hide something new
 * the user just asked for. Plans with no time come after the timed ones.
 */
export function comingUp(items: Item[], max = 5): { soon: Item[]; repeating: Item[]; more: number } {
  const sorted = [...items].sort((a, b) => when(a) - when(b));
  const once = sorted.filter((i) => !i.repeat_every_minutes);
  const again = sorted.filter((i) => i.repeat_every_minutes);
  const soon = once.slice(0, max);
  const repeating = again.slice(0, max);
  return { soon, repeating, more: items.length - soon.length - repeating.length };
}
