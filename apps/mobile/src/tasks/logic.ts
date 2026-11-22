import type { CircleTask } from "@fakkarni/shared";

/** Pure helpers for assigned tasks (unit-tested; no react-native imports). */
export type TaskAction = "accept" | "decline" | "done" | "nudge" | "cancel";

/** What this person can do with a task right now, most useful first. Mirrors the server's rules. */
export function taskActions(t: Pick<CircleTask, "status" | "role" | "can_nudge">): TaskAction[] {
  if (t.role === "assignee") return t.status === "pending" ? ["accept", "decline"] : t.status === "accepted" ? ["done"] : [];
  if (t.role !== "assigner" || (t.status !== "pending" && t.status !== "accepted")) return [];
  return t.can_nudge ? ["nudge", "cancel"] : ["cancel"];
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
