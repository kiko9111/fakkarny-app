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

/**
 * A record this long past its time is taken as fired, and only then forgotten. Android 12 and
 * later ring an alarm set without the exact-alarm permission (this app has none) up to about an
 * hour late, and the library keeps it scheduled until it rings: forgotten sooner, it could no
 * longer be cancelled, and it rang for a plan already closed.
 */
export const FIRED_GRACE_MS = 3 * 60 * 60_000;

/**
 * A "Later" snooze gives way to one of the plan's own reminders that rings from SNOOZE_BEFORE_MS
 * before it to SNOOZE_AFTER_MS after it. Later also sends a chat line asking the server to move the
 * plan an hour on: read at once, the moved reminder rang a few seconds after the snooze; read late
 * (Later tapped offline, the line sent when the phone is back), up to an hour after it. Never to a
 * follow-up ("how did it go?"): that is a question about the plan, not its reminder.
 */
export const SNOOZE_BEFORE_MS = 15 * 60_000;
export const SNOOZE_AFTER_MS = 60 * 60_000;

/** Short stable hash of a text (FNV-1a, 32 bit), so the record keeps no words. */
export function hashText(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * What makes a planned notification the same as one already scheduled: its time, kind, alarm or
 * not, its words and the plan's title (Done and Later on it send the title to the chat).
 */
export function signature(n: Pick<PlannedNotification, "date" | "kind" | "alarm" | "body" | "title">): string {
  return `${n.date.getTime()}|${n.kind}|${n.alarm ? 1 : 0}|${hashText(n.title === undefined ? n.body : `${n.body}\n${n.title}`)}`;
}

/**
 * Recorded for a notification the phone holds that this app has no details of, when the phone
 * says when it fires. It never matches a plan (a planned one is scheduled again), but its time
 * shows whether it is still ahead or one that Android has not rung yet.
 */
export function listedSignature(at: number): string {
  return `${at}|listed`;
}

/** When a recorded notification fires, or null when that is not known. */
export function firesAt(sig: string): number | null {
  if (sig === UNKNOWN) return null;
  const ms = Number(sig.slice(0, sig.indexOf("|")));
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

/**
 * What the record keeps at a launch for a notification the phone lists (the phone is the truth;
 * the record only adds the details). Where the phone says when it fires (Android), a record with
 * another time is stale: a run stopped before it was written. Where it doesn't (iOS), a record
 * whose time has passed is stale too, because iOS rings on time and drops what it rang: taken as
 * fired, it would be forgotten instead of cancelled.
 */
export function launchSignature(saved: string | undefined, listedAt: number | null, now: number): string {
  if (saved !== undefined) {
    const recorded = firesAt(saved);
    if (listedAt === null ? recorded === null || recorded > now : recorded === listedAt) return saved;
  }
  return listedAt ? listedSignature(listedAt) : UNKNOWN;
}

export interface ItemChanges {
  /** Planned notifications not scheduled yet, or scheduled with other details (scheduling an identifier again replaces it). */
  schedule: PlannedNotification[];
  /** This item's scheduled identifiers that its plan no longer has. */
  cancel: string[];
  /** Records long past their time (FIRED_GRACE_MS): those fired and the phone dropped them, so only the record goes. */
  forget: string[];
}

/** Whether one of the plan's notifications rings in place of a "Later" snooze set for `at`. */
function takesOver(n: PlannedNotification, at: number): boolean {
  const t = n.date.getTime();
  return n.kind !== "followup" && t >= at - SNOOZE_BEFORE_MS && t <= at + SNOOZE_AFTER_MS;
}

/**
 * What to change so that one item's scheduled notifications match `plan` (empty for a closed
 * item). Only this item's identifiers are looked at. While the item is open, one whose time has
 * come (the plan only holds what is still ahead) is left to ring, late or not, and its "Later"
 * snooze stays unless one of the plan's own reminders rings near it (SNOOZE_BEFORE_MS before to
 * SNOOZE_AFTER_MS after). A closed item loses every one that has not surely rung (FIRED_GRACE_MS),
 * past its time or not: one that Android has not rung yet must not ring for a closed plan.
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
    else if (!open) out.cancel.push(id);
    else if (id === snooze) {
      if (at !== null && at > now && plan.some((n) => takesOver(n, at))) out.cancel.push(id);
    } else if (at === null || at > now) out.cancel.push(id);
  }
  for (const n of plan) if (known.get(n.identifier) !== signature(n)) out.schedule.push(n);
  return out;
}
