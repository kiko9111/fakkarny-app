import type { CircleTask, MoneySection, PocketAccount, Split } from "@fakkarni/shared";
import { localDay } from "@/homework/logic";
import { sortTasks } from "./logic";

/** Pure helpers for a circle's job screens: tasks, homework, money (tested in jobs.test.ts). */

type TaskBit = Pick<CircleTask, "status" | "role" | "created_at" | "homework">;

/** Finished rows kept on a job screen: the newest few, so the open ones stay in the first phone-height. */
export const DONE_SHOWN = 5;

/** A circle's tasks that are not homework: what waits for my answer, what is open, the last finished. */
export function taskSections<T extends TaskBit>(tasks: readonly T[]): { waiting: T[]; open: T[]; done: T[] } {
  const plain = sortTasks(tasks.filter((t) => !t.homework && t.status !== "cancelled"));
  const mine = (t: T) => t.status === "pending" && t.role === "assignee";
  const isOpen = (t: T) => t.status === "pending" || t.status === "accepted";
  return {
    waiting: plain.filter(mine),
    open: plain.filter((t) => isOpen(t) && !mine(t)),
    done: plain.filter((t) => !isOpen(t)).slice(0, DONE_SHOWN),
  };
}

type HomeworkBit = TaskBit & Pick<CircleTask, "due_at" | "submission" | "submitted_at" | "review" | "done_at">;

/** A group of open homework: a local day ("YYYY-MM-DD"), "late" (its day has passed) or "none" (no day). */
export interface HomeworkDay<T> {
  key: string;
  tasks: T[];
}

/** Handed in and waiting for the parent's answer (the same test as TaskCard's review buttons). */
export const waitsForReview = (t: Pick<CircleTask, "homework" | "role" | "status" | "submission" | "review">) =>
  t.homework && t.role === "assigner" && t.status === "done" && t.submission !== null && t.review === null;

/**
 * A circle's homework: to review first (the oldest hand-in first), then the open ones by due day
 * (late, then the days in order, then those with no day), then what was finished in the last week
 * and what the child said no to (the parent has to see that, as on the tasks screen).
 */
export function homeworkSections<T extends HomeworkBit>(tasks: readonly T[], now: Date): { review: T[]; days: HomeworkDay<T>[]; done: T[] } {
  const all = tasks.filter((t) => t.homework);
  const review = all.filter(waitsForReview).sort((a, b) => (a.submitted_at ?? "").localeCompare(b.submitted_at ?? ""));
  const today = localDay(now);
  const groups = new Map<string, T[]>();
  for (const t of sortTasks(all.filter((t) => t.status === "pending" || t.status === "accepted"))) {
    const day = t.due_at ? localDay(new Date(t.due_at)) : null;
    const key = day === null ? "none" : day < today ? "late" : day;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const rank = (key: string) => (key === "late" ? "0" : key === "none" ? "9" : `1${key}`);
  const days = [...groups].map(([key, list]) => ({ key, tasks: list })).sort((a, b) => rank(a.key).localeCompare(rank(b.key)));
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const ended = (t: T) => t.done_at ?? t.created_at;
  const done = all
    .filter((t) => (t.status === "done" && !waitsForReview(t) && (t.done_at ?? "") >= weekAgo) || t.status === "declined")
    .sort((a, b) => Number(b.status === "declined") - Number(a.status === "declined") || ended(b).localeCompare(ended(a)))
    .slice(0, DONE_SHOWN);
  return { review, days, done };
}

/** How a homework day is named: today, tomorrow, or its date. */
export function dayKind(day: string, now: Date): "today" | "tomorrow" | "date" {
  if (day === localDay(now)) return "today";
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return day === localDay(next) ? "tomorrow" : "date";
}

/** This circle's shared expense books, oldest first (the order they were made in). */
export function circleBooks<T extends Pick<MoneySection, "circle_id" | "created_at">>(sections: readonly T[], circleId: string): T[] {
  return sections.filter((s) => s.circle_id === circleId).sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** This circle's group splits, newest first. */
export function circleSplits<T extends Pick<Split, "circle_id" | "created_at">>(splits: readonly T[], circleId: string): T[] {
  return splits.filter((s) => s.circle_id === circleId).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** People who still have to pay the one who paid the bill. */
export function splitLeft(s: Pick<Split, "paid_by" | "people">): number {
  return s.paid_by === null ? 0 : s.people.filter((p, i) => i !== s.paid_by && !p.paid).length;
}

/** Pocket-money records of one circle; every record when no circle is given. */
export function pocketIn(accounts: readonly PocketAccount[], circleId?: string): PocketAccount[] {
  return circleId ? accounts.filter((a) => a.circle_id === circleId) : [...accounts];
}
