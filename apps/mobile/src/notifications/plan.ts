/**
 * Which local notifications a reminder gets (PRD F5, FR-6). Pure, so it is unit-tested.
 *
 * - Indirect hint at remind time: the friend's question ("Heading out soon? Traffic to Dokki…").
 * - Clear backup ("Just so you don't miss it: dentist at 6") when the deadline is close:
 *   at the due time for important items, else 30 minutes before it.
 * - "Always direct" (settings) → only the clear version, at remind time.
 * Local notifications fire offline, which is why reminders live on the phone.
 */
import { nextOccurrences } from "@fakkarni/shared";

export interface ReminderItem {
  id: string;
  title: string;
  nudge: string | null;
  status: string;
  due_at: string | null;
  remind_at: string | null;
  important: boolean;
  repeat_every_minutes?: number | null;
  follow_up_at?: string | null;
}

export interface PlannedNotification {
  identifier: string;
  date: Date;
  body: string;
  kind: "hint" | "clear" | "repeat" | "followup";
  itemId: string;
}

export const CLEAR_LEAD_MS = 30 * 60_000;

export function hintId(itemId: string) {
  return `item_${itemId}_hint`;
}
export function clearId(itemId: string) {
  return `item_${itemId}_clear`;
}
export function followupId(itemId: string) {
  return `item_${itemId}_followup`;
}
/** A repeating reminder gets one notification per upcoming occurrence. */
export const REPEAT_SLOTS = 16;
export function repeatId(itemId: string, slot: number) {
  return `item_${itemId}_r${slot}`;
}
/** Every identifier an item may have scheduled, for cancelling before re-planning. */
export function allIds(itemId: string): string[] {
  return [hintId(itemId), clearId(itemId), followupId(itemId), ...Array.from({ length: REPEAT_SLOTS }, (_, n) => repeatId(itemId, n))];
}

export function planReminderNotifications(
  item: ReminderItem,
  opts: {
    now: Date;
    alwaysDirect: boolean;
    clearText: (title: string, due: Date) => string;
    /** "How did it go?" text for the follow-up notification; omit to plan none. */
    followupText?: (title: string) => string;
    /** Waking hours, for repeating reminders and follow-ups. Defaults to always awake. */
    awake?: (at: Date) => boolean;
  },
): PlannedNotification[] {
  if (item.status !== "open") return [];
  const due = item.due_at ? new Date(item.due_at) : null;
  const remind = item.remind_at ? new Date(item.remind_at) : due;
  if (!remind) return [];
  const awake = opts.awake ?? (() => true);

  // Repeating ("every hour"): the next occurrences from the same anchor the server uses, awake hours only.
  if (item.repeat_every_minutes) {
    const upcoming = remind.getTime() > opts.now.getTime() ? [remind] : [];
    const more = nextOccurrences(remind, item.repeat_every_minutes, new Date(Math.max(opts.now.getTime(), remind.getTime())), REPEAT_SLOTS, awake);
    return [...upcoming.filter(awake), ...more].slice(0, REPEAT_SLOTS).map((date, n) => ({
      identifier: repeatId(item.id, n),
      date,
      body: item.nudge ?? item.title,
      kind: "repeat" as const,
      itemId: item.id,
    }));
  }

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
  // Afterwards: "how did it go?" The server writes the real question into the chat at the same time.
  const follow = item.follow_up_at ? new Date(item.follow_up_at) : null;
  if (follow && opts.followupText && awake(follow)) {
    out.push({ identifier: followupId(item.id), date: follow, body: opts.followupText(item.title), kind: "followup", itemId: item.id });
  }
  return out.filter((n) => n.date.getTime() > opts.now.getTime());
}

/** "{title} at {time}" templating for i18n strings. */
export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");
}
