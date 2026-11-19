/**
 * Which local notifications a reminder gets (PRD F5, FR-6). Pure, so it is unit-tested.
 *
 * - Indirect hint at remind time: the friend's question ("Heading out soon? Traffic to Dokki…").
 * - Clear backup ("Just so you don't miss it: dentist at 6") when the deadline is close:
 *   at the due time for important items, else 30 minutes before it.
 * - "Always direct" (settings) → only the clear version, at remind time.
 * Local notifications fire offline, which is why reminders live on the phone.
 */

export interface ReminderItem {
  id: string;
  title: string;
  nudge: string | null;
  status: string;
  due_at: string | null;
  remind_at: string | null;
  important: boolean;
}

export interface PlannedNotification {
  identifier: string;
  date: Date;
  body: string;
  kind: "hint" | "clear";
  itemId: string;
}

export const CLEAR_LEAD_MS = 30 * 60_000;

export function hintId(itemId: string) {
  return `item_${itemId}_hint`;
}
export function clearId(itemId: string) {
  return `item_${itemId}_clear`;
}

export function planReminderNotifications(
  item: ReminderItem,
  opts: { now: Date; alwaysDirect: boolean; clearText: (title: string, due: Date) => string },
): PlannedNotification[] {
  if (item.status !== "open") return [];
  const due = item.due_at ? new Date(item.due_at) : null;
  const remind = item.remind_at ? new Date(item.remind_at) : due;
  if (!remind) return [];

  const out: PlannedNotification[] = [];
  const clearFor = (d: Date): string => opts.clearText(item.title, due ?? d);
  if (opts.alwaysDirect) {
    out.push({ identifier: clearId(item.id), date: remind, body: clearFor(remind), kind: "clear", itemId: item.id });
  } else {
    out.push({ identifier: hintId(item.id), date: remind, body: item.nudge ?? item.title, kind: "hint", itemId: item.id });
    if (due) {
      const clearAt = item.important ? due : new Date(due.getTime() - CLEAR_LEAD_MS);
      if (clearAt.getTime() > remind.getTime()) {
        out.push({ identifier: clearId(item.id), date: clearAt, body: clearFor(clearAt), kind: "clear", itemId: item.id });
      }
    }
  }
  return out.filter((n) => n.date.getTime() > opts.now.getTime());
}

/** "{title} at {time}" templating for i18n strings. */
export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");
}
