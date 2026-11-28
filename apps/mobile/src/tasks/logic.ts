import { linkTaskCancellable, linkTaskShareable, type CircleTask, type LinkTask } from "@fakkarni/shared";

/** Pure helpers for assigned tasks (unit-tested; no react-native imports). */
export type TaskAction = "accept" | "decline" | "done" | "nudge" | "cancel";

/** What this person can do with a task right now, most useful first. Mirrors the server's rules. */
export function taskActions(t: Pick<CircleTask, "status" | "role" | "can_nudge">): TaskAction[] {
  if (t.role === "assignee") return t.status === "pending" ? ["accept", "decline"] : t.status === "accepted" ? ["done"] : [];
  if (t.role !== "assigner" || (t.status !== "pending" && t.status !== "accepted")) return [];
  return t.can_nudge ? ["nudge", "cancel"] : ["cancel"];
}

/**
 * What a task looks like right after a tap, drawn at once while the server confirms: its answer
 * then replaces this guess, and a failure puts the old one back. Null when the tap has nothing to
 * show before the server has really done it (a nudge is Zaki writing to someone).
 */
export function guessTask<T extends Pick<CircleTask, "status" | "responded_at" | "done_at">>(t: T, action: TaskAction, now: Date): T | null {
  const at = now.toISOString();
  if (action === "accept") return { ...t, status: "accepted", responded_at: at };
  if (action === "decline") return { ...t, status: "declined", responded_at: at };
  if (action === "done") return { ...t, status: "done", done_at: at };
  if (action === "cancel") return { ...t, status: "cancelled" };
  return null;
}

/** Needs my answer first, then open ones, then finished; newest first inside each group. */
export function sortTasks<T extends Pick<CircleTask, "status" | "role" | "created_at">>(tasks: readonly T[]): T[] {
  const rank = (t: T) => (t.status === "pending" && t.role === "assignee" ? 0 : t.status === "pending" || t.status === "accepted" ? 1 : 2);
  return [...tasks].sort((a, b) => rank(a) - rank(b) || b.created_at.localeCompare(a.created_at));
}

export type DueChoice = "none" | "today" | "tomorrow" | "week";

/** "Today" is offered only while there is still an evening to do it in. */
export const dueChoices = (now: Date): DueChoice[] => (now.getHours() < 17 ? ["none", "today", "tomorrow", "week"] : ["none", "tomorrow", "week"]);

/** A quick "by when" pick → an instant in the phone's own time zone (no date picker needed). */
export function dueAt(choice: DueChoice, now: Date): string | null {
  if (choice === "none") return null;
  const d = new Date(now);
  if (choice === "today") d.setHours(18, 0, 0, 0);
  else {
    d.setDate(d.getDate() + (choice === "tomorrow" ? 1 : 7));
    d.setHours(10, 0, 0, 0);
  }
  return d.toISOString();
}

export type IftarDay = "today" | "tomorrow" | "friday";

/** The calendar day ("YYYY-MM-DD", phone's own time zone) for an iftar pick. "friday" is the next Friday after today. */
export function iftarDate(pick: IftarDay, now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (pick === "tomorrow") d.setDate(d.getDate() + 1);
  if (pick === "friday") d.setDate(d.getDate() + (((5 - d.getDay() + 7) % 7) || 7));
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/** When Zaki reminds the other person. "due" = at the deadline (or no reminder time of its own). */
export type RemindChoice = "due" | "hour" | "evening" | "morning" | "beforeDue";

/** The picks that make sense now: an evening only while it is still ahead, "an hour before" only with a deadline. */
export function remindChoices(now: Date, due: string | null): RemindChoice[] {
  const out: RemindChoice[] = ["due", "hour"];
  if (now.getHours() < 19) out.push("evening");
  out.push("morning");
  if (due && new Date(due).getTime() - 3_600_000 > now.getTime() + 30 * 60_000) out.push("beforeDue");
  return out;
}

/** A reminder pick → an instant (phone's own time zone), or null for "with the deadline". */
export function remindAt(choice: RemindChoice, now: Date, due: string | null): string | null {
  const d = new Date(now);
  if (choice === "due") return null;
  if (choice === "hour") return new Date(now.getTime() + 3_600_000).toISOString();
  if (choice === "beforeDue") return due ? new Date(new Date(due).getTime() - 3_600_000).toISOString() : null;
  if (choice === "evening") d.setHours(19, 0, 0, 0);
  else {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
  }
  return d.toISOString();
}

/** The first web link in a homework note, so the child can open it with one tap. */
export function firstLink(note: string | null | undefined): string | null {
  const m = note?.match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0].replace(/[.,;:!?)\]]+$/, "") : null;
}

export type LinkTaskState = "pending" | "seen" | "accepted" | "declined" | "done" | "cancelled";

/** A task sent by link, as its creator sees it: the word under it and the buttons it has. */
export function linkTaskView(t: Pick<LinkTask, "status" | "seen">): { state: LinkTaskState; again: boolean; cancel: boolean } {
  const state: LinkTaskState = t.status === "pending" && t.seen ? "seen" : t.status;
  return { state, again: linkTaskShareable(t.status), cancel: linkTaskCancellable(t.status) };
}

/** Open ones first (waiting, then accepted), then the rest; newest first inside each. Done ones older than a week drop off. */
export function sortLinkTasks<T extends Pick<LinkTask, "status" | "created_at" | "done_at">>(tasks: readonly T[], now: Date): T[] {
  const rank = (t: T) => (t.status === "pending" ? 0 : t.status === "accepted" ? 1 : t.status === "declined" ? 2 : 3);
  const weekAgo = now.getTime() - 7 * 86_400_000;
  return tasks
    .filter((t) => t.status !== "cancelled" && !(t.status === "done" && t.done_at && Date.parse(t.done_at) < weekAgo))
    .sort((a, b) => rank(a) - rank(b) || b.created_at.localeCompare(a.created_at));
}
