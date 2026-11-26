/**
 * Which local-notification calls one item needs, given what is already scheduled. Pure.
 *
 * On Android each schedule or cancel is its own trip through the system (a broadcast to the
 * library's receiver, a disk write, an alarm, an answer back on the main thread), so planning a
 * reminder by clearing every identifier it might have and scheduling it again cost dozens of
 * trips, on every return to the app. Comparing the plan with a record of what is scheduled
 * leaves nothing to do in the usual case.
 */
import { itemPrefix, snoozeId, type PlannedNotification } from "./plan";

/** Recorded for a notification the phone holds that this app has no details of. */
export const UNKNOWN = "?";

/** A record older than this many ms past its time is taken as fired (the library drops fired ones). */
export const FIRED_GRACE_MS = 2 * 60_000;

/** Short stable hash of a text (FNV-1a, 32 bit), so the record keeps no words. */
export function hashText(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** What makes a planned notification the same as one already scheduled: its time, kind, alarm or not, and words. */
export function signature(n: Pick<PlannedNotification, "date" | "kind" | "alarm" | "body">): string {
  return `${n.date.getTime()}|${n.kind}|${n.alarm ? 1 : 0}|${hashText(n.body)}`;
}

/** When a recorded notification fires, or null when that is not known. */
export function firesAt(sig: string): number | null {
  if (sig === UNKNOWN) return null;
  const ms = Number(sig.slice(0, sig.indexOf("|")));
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

export interface ItemChanges {
  /** Planned notifications not scheduled yet, or scheduled with other details (scheduling an identifier again replaces it). */
  schedule: PlannedNotification[];
  /** This item's scheduled identifiers that its plan no longer has. */
  cancel: string[];
  /** Records whose time has passed: those fired and the phone dropped them, so only the record goes. */
  forget: string[];
}

/**
 * What to change so that one item's scheduled notifications match `plan` (empty for a closed
 * item). Only this item's identifiers are looked at. While the item is open, one that is due now
 * (the plan only holds what is still ahead) is left to ring, and its "Later" snooze stays; a
 * closed item loses everything that has not surely fired.
 */
export function itemChanges(
  itemId: string,
  plan: readonly PlannedNotification[],
  known: ReadonlyMap<string, string>,
  now: number,
  open: boolean,
): ItemChanges {
  const prefix = itemPrefix(itemId);
  const snooze = snoozeId(itemId);
  const wanted = new Set(plan.map((n) => n.identifier));
  const out: ItemChanges = { schedule: [], cancel: [], forget: [] };
  for (const [id, sig] of known) {
    if (!id.startsWith(prefix) || wanted.has(id)) continue;
    const at = firesAt(sig);
    if (at !== null && at < now - FIRED_GRACE_MS) out.forget.push(id);
    else if (open && (id === snooze || (at !== null && at <= now))) continue;
    else out.cancel.push(id);
  }
  for (const n of plan) if (known.get(n.identifier) !== signature(n)) out.schedule.push(n);
  return out;
}
