import { daysToPayDay, dosesToAnswer, isPaid, myMember, phaseOf, roundState, type CareMed, type CircleTask, type DaftarEntry, type Gameya, type Split } from "@fakkarni/shared";

/**
 * Today's "Needs you": one inbox of what waits for this person's answer, built from the saved
 * copies the phone already holds (GET /tasks, /daftar, /splits, /care). Pure; the words come in.
 */
export type NeedKind = "dose" | "task" | "homework_review" | "daftar" | "split" | "gameya";

/** A row's one button when it answers in place; without it the button opens `route`. */
export type NeedAction = { type: "accept_task" } | { type: "confirm_daftar" } | { type: "pay_gameya"; memberId: string; round: number } | { type: "dose_taken"; medId: string; dueAt: string };

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
  /** "{amount}" this round, and when: due in a few days, today, or late. */
  gameyaPay: string;
  gameyaToday: string;
  gameyaLate: string;
  /** To the organizer once everyone paid: "Hand {name} the pot". */
  gameyaHand: string;
  money: (amount: number) => string;
  /** "{time} not marked", and how a dose's time is written ("8:00 PM"). */
  doseNotMarked: string;
  yesterday: string;
  clock: (hhmm: string) => string;
}

export interface NeedsInput {
  tasks?: readonly CircleTask[] | null;
  daftar?: readonly DaftarEntry[] | null;
  splits?: readonly Split[] | null;
  gameyas?: readonly Gameya[] | null;
  /** The phone's local date, "YYYY-MM-DD" (gam'eya pay days). */
  today?: string;
  care?: readonly CareMed[] | null;
}

/** A gam'eya payment shows from this many days before its pay day. */
export const GAMEYA_DUE_DAYS = 3;

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
 * The rows, in the order they are shown: medicine doses nobody marked first (someone may be
 * waiting on them), then requests, then homework to review, Daftar entries
 * to confirm, then bill shares to pay; the oldest first inside each kind.
 */
export function needsYou(input: NeedsInput, words: NeedWords): NeedRow[] {
  const tasks = input.tasks ?? [];
  const name = (n: string | null | undefined) => n?.trim() || words.noName;
  const rows: NeedRow[] = [];

  const doses = (input.care ?? []).flatMap((med) => dosesToAnswer(med).map((dose) => ({ med, dose, earlier: med.open_missed.includes(dose) })));
  for (const { med, dose, earlier } of oldestFirst(doses, (x) => x.dose.due_at)) {
    const time = `${earlier ? `${words.yesterday} ` : ""}${words.clock(dose.time)}`;
    rows.push({
      kind: "dose",
      id: `${med.id}:${dose.due_at}`,
      title: `${med.person_name}: ${med.name}`,
      line: words.doseNotMarked.replace("{time}", time),
      route: `/circle/care?id=${encodeURIComponent(med.circle_id)}`,
      action: { type: "dose_taken", medId: med.id, dueAt: dose.due_at },
    });
  }

  for (const t of oldestFirst(tasks.filter(isTaskRequest), (t) => t.created_at)) {
    rows.push({ kind: "task", id: t.id, title: t.title, line: words.taskFrom.replace("{name}", name(t.assigner_name)), route: circleRoute(t), action: { type: "accept_task" } });
  }
  for (const t of oldestFirst(tasks.filter(isHomeworkToReview), (t) => t.submitted_at ?? t.done_at ?? t.created_at)) {
    rows.push({ kind: "homework_review", id: t.id, title: t.title, line: words.handedIn.replace("{name}", name(t.assignee_name)), route: circleRoute(t) });
  }
  for (const e of oldestFirst((input.daftar ?? []).filter(isDaftarToConfirm), (e) => e.created_at)) {
    const line = (e.direction === "i_owe" ? words.youOwe : words.owedToYou).replace("{amount}", words.money(e.amount));
    rows.push({ kind: "daftar", id: e.id, title: name(e.other_name), line, route: "/money?part=people", action: { type: "confirm_daftar" } });
  }
  for (const s of oldestFirst(input.splits ?? [], (s) => s.created_at)) {
    const share = myOpenShare(s);
    if (share === null) continue;
    rows.push({ kind: "split", id: s.id, title: s.title.trim() || s.owner_name?.trim() || words.splitTitle, line: words.yourShare.replace("{amount}", words.money(share)), route: `/split/${encodeURIComponent(s.id)}` });
  }
  if (input.today) rows.push(...gameyaNeeds(input.gameyas ?? [], input.today, words));
  return rows;
}

/**
 * Gam'eya rows: my payment this round from GAMEYA_DUE_DAYS before pay day (and after, while
 * unpaid), and for the organizer, the pot to hand over once everyone paid.
 */
export function gameyaNeeds(gameyas: readonly Gameya[], today: string, words: NeedWords): NeedRow[] {
  const rows: NeedRow[] = [];
  for (const g of gameyas) {
    if (phaseOf(g) !== "running") continue;
    const route = `/gameya/${encodeURIComponent(g.id)}`;
    const me = myMember(g);
    const days = daysToPayDay(g, g.round, today);
    if (me && !isPaid(g, me.id, g.round) && days <= GAMEYA_DUE_DAYS) {
      const when = days < 0 ? words.gameyaLate : days === 0 ? words.gameyaToday : words.gameyaPay;
      rows.push({ kind: "gameya", id: `${g.id}:pay`, title: g.name, line: when.replace("{amount}", words.money(g.amount)), route, action: { type: "pay_gameya", memberId: me.id, round: g.round } });
    }
    const s = roundState(g, g.round);
    if (g.mine && s.allPaid && s.receiver && !s.receiver.received) {
      rows.push({ kind: "gameya", id: `${g.id}:hand`, title: g.name, line: words.gameyaHand.replace("{name}", s.receiver.name), route });
    }
  }
  return rows;
}
