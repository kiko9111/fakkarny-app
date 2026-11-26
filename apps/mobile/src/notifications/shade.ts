/**
 * Which reminders to take out of the notification shade. Pure, so it is unit-tested.
 *
 * Android keeps a notification in the shade until it is swiped away or tapped, also after Done
 * or Later on it, and each occurrence of a repeating reminder has its own identifier: an hourly
 * reminder left a new one there every hour, and a plan ticked off in Today kept its reminder.
 */

/** A notification in the shade: its identifier and when it was shown (ms). */
export interface Shown {
  identifier: string;
  date: number;
}

/** item_<id>_<kind> of a reminder. Follow-ups ("how did it go?") are questions to answer: left alone. */
const REMINDER = /^item_(.+)_(hint|clear|snooze|r\d+)$/;

/** The item a reminder in the shade belongs to, or null for anything else (Zaki's messages, follow-ups). */
export function shownItemId(identifier: string): string | null {
  return REMINDER.exec(identifier)?.[1] ?? null;
}

/**
 * Reminders that no longer help: every one of a plan that is closed, and all but the newest of a
 * plan that is still open (the newest says the same, and is the latest). `status` is the plan's
 * status on this phone; a plan the phone does not hold (undefined) is left alone.
 */
export function staleShown(shown: readonly Shown[], status: (itemId: string) => string | undefined): string[] {
  const newest = new Map<string, Shown>();
  const out: string[] = [];
  for (const n of shown) {
    const itemId = shownItemId(n.identifier);
    if (itemId === null) continue;
    const st = status(itemId);
    if (st === undefined) continue;
    if (st !== "open") {
      out.push(n.identifier);
      continue;
    }
    const kept = newest.get(itemId);
    if (!kept) newest.set(itemId, n);
    else if (n.date > kept.date) {
      out.push(kept.identifier);
      newest.set(itemId, n);
    } else out.push(n.identifier);
  }
  return out;
}
