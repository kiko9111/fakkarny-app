import type { Item } from "@fakkarni/shared";

/**
 * The times a plan's row shows. `main`: an alarm's own time; otherwise the plan's own time, or
 * when Zaki reminds for a plan that has no time of its own (a task accepted with only a reminder
 * time used to show no time at all). `reminder`: when Zaki reminds, if that is set apart from the
 * plan's own time ("an hour before"), so moving only the reminder shows on the row too. Pure.
 */
export function planTimes(item: Pick<Item, "alarm" | "remind_at" | "due_at">): { main: string | null; reminder: string | null } {
  const remind = item.remind_at || null;
  const due = item.due_at || null;
  if (item.alarm) return { main: remind ?? due, reminder: null };
  const apart = remind && due && Date.parse(remind) !== Date.parse(due) ? remind : null;
  return { main: due ?? remind, reminder: apart };
}
