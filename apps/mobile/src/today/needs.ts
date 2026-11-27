import type { CircleTask, DaftarEntry, Split } from "@fakkarni/shared";

/**
 * Today's "Needs you": one inbox of what waits for this person's answer, built from the saved
 * copies the phone already holds (GET /tasks, /daftar, /splits). Pure; the words come in.
 */
export type NeedKind = "task" | "homework_review" | "daftar" | "split";

/** A row's one button when it answers in place; without it the button opens `route`. */
export type NeedAction = { type: "accept_task" } | { type: "confirm_daftar" };

export interface NeedRow {
  kind: NeedKind;
  /** The task's, entry's or split's id. */
  id: string;
  title: string;
  line: string;
  /** The item's own screen (where "no" and everything else lives). */
  route: string;
  action?: NeedAction;
}

/** Templates with "{name}" / "{amount}", and how money is written. */
export interface NeedWords {
  taskFrom: string;
  handedIn: string;
  youOwe: string;
  owedToYou: string;
  yourShare: string;
  noName: string;
  splitTitle: string;
  money: (amount: number) => string;
}

export interface NeedsInput {
  tasks?: readonly CircleTask[] | null;
  daftar?: readonly DaftarEntry[] | null;
  splits?: readonly Split[] | null;
}

type TaskLike = Pick<CircleTask, "status" | "role" | "homework" | "submission" | "review" | "photo_ids">;

/** A request that waits for my yes or no. */
export const isTaskRequest = (t: TaskLike) => t.status === "pending" && t.role === "assignee";

/** Homework I set that was handed in and has no review yet. */
export const isHomeworkToReview = (t: TaskLike) => t.homework && t.role === "assigner" && t.status === "done" && t.review === null && (t.submission !== null || t.photo_ids.length > 0);

/** An entry the other person wrote that waits for my "right / not right". */
export const isDaftarToConfirm = (e: Pick<DaftarEntry, "status" | "mine">) => e.status === "pending" && !e.mine;

/** My unpaid share of a bill someone else split (as the split's own screen decides it), or null. */
export function myOpenShare(s: Pick<Split, "mine" | "me" | "paid_by" | "people">): number | null {
  if (s.mine !== false || s.me == null || s.paid_by === null || s.me === s.paid_by) return null;
  const row = s.people[s.me];
  return row && !row.paid && row.share > 0 ? row.share : null;
}

const oldestFirst = <T>(rows: readonly T[], at: (row: T) => string): T[] => [...rows].sort((a, b) => at(a).localeCompare(at(b)));
const circleRoute = (t: Pick<CircleTask, "homework" | "circle_id">) => `/circle/${t.homework ? "homework" : "tasks"}?id=${encodeURIComponent(t.circle_id)}`;

/**
 * The rows, in the order they are shown: requests first, then homework to review, Daftar entries
 * to confirm, then bill shares to pay; the oldest first inside each kind.
 */
export function needsYou(input: NeedsInput, words: NeedWords): NeedRow[] {
  const tasks = input.tasks ?? [];
  const name = (n: string | null | undefined) => n?.trim() || words.noName;
  const rows: NeedRow[] = [];

  for (const t of oldestFirst(tasks.filter(isTaskRequest), (t) => t.created_at)) {
    rows.push({ kind: "task", id: t.id, title: t.title, line: words.taskFrom.replace("{name}", name(t.assigner_name)), route: circleRoute(t), action: { type: "accept_task" } });
  }
  for (const t of oldestFirst(tasks.filter(isHomeworkToReview), (t) => t.submitted_at ?? t.done_at ?? t.created_at)) {
    rows.push({ kind: "homework_review", id: t.id, title: t.title, line: words.handedIn.replace("{name}", name(t.assignee_name)), route: circleRoute(t) });
  }
  for (const e of oldestFirst((input.daftar ?? []).filter(isDaftarToConfirm), (e) => e.created_at)) {
    const line = (e.direction === "i_owe" ? words.youOwe : words.owedToYou).replace("{amount}", words.money(e.amount));
    rows.push({ kind: "daftar", id: e.id, title: name(e.other_name), line, route: "/money", action: { type: "confirm_daftar" } });
  }
  for (const s of oldestFirst(input.splits ?? [], (s) => s.created_at)) {
    const share = myOpenShare(s);
    if (share === null) continue;
    rows.push({ kind: "split", id: s.id, title: s.title.trim() || s.owner_name?.trim() || words.splitTitle, line: words.yourShare.replace("{amount}", words.money(share)), route: `/split/${encodeURIComponent(s.id)}` });
  }
  return rows;
}
