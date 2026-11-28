import { dosesToAnswer, nextDose, type CareMed, type CircleMember, type CircleTask } from "@fakkarni/shared";
import { isHomeworkToReview, isTaskRequest } from "@/today/needs";

/**
 * A circle by person (design round 2): one row per member with their last check-in and the one
 * open thing between them and the reader, the most pressing first. Pure; the words come in.
 */

export type MemberThing =
  /** A dose of theirs nobody marked: the button says Taken. */
  | { type: "dose"; text: string; medId: string; dueAt: string }
  /** They asked the reader for something: the button says Yes. */
  | { type: "request"; text: string; taskId: string }
  /** Homework of theirs to look at. */
  | { type: "review"; text: string; taskId: string }
  /** The reader asked them and it is still open. */
  | { type: "asked"; text: string; taskId: string; homework: boolean }
  /** Their next dose today. */
  | { type: "next"; text: string; medId: string };

export interface MemberRow {
  member: CircleMember;
  thing: MemberThing | null;
}

export interface PeopleWords {
  /** "Asked you: {title}" */
  askedYou: string;
  /** "You asked: {title}" */
  youAsked: string;
  /** "{med} not marked" */
  notMarked: string;
  /** "{med} · {time}" */
  nextDose: string;
  clock: (hhmm: string) => string;
}

/** How many member rows a circle shows before "N more". */
export const MAX_MEMBERS = 5;

const RANK: Record<MemberThing["type"], number> = { dose: 0, request: 1, review: 2, asked: 3, next: 4 };
const isOpen = (t: Pick<CircleTask, "status">) => t.status === "pending" || t.status === "accepted";
const oldest = <T extends { created_at: string }>(rows: T[]): T | undefined => [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];

/** The one thing to show beside a member, or null. `tasks` and `meds` are this circle's. */
export function thingFor(member: CircleMember, tasks: readonly CircleTask[], meds: readonly CareMed[], words: PeopleWords, uniqueName: boolean): MemberThing | null {
  const theirs = meds.filter((m) => m.active && (m.person_user_id === member.user_id || (member.is_me && m.for_me)));
  for (const med of theirs) {
    const dose = dosesToAnswer(med)[0];
    if (dose) return { type: "dose", text: words.notMarked.replace("{med}", med.name), medId: med.id, dueAt: dose.due_at };
  }
  if (!member.is_me) {
    // A task names its assigner only by name: it is theirs only when no other member shares the name.
    const request = uniqueName ? oldest(tasks.filter((t) => isTaskRequest(t) && (t.assigner_name ?? "").trim() === (member.name ?? "").trim())) : undefined;
    if (request) return { type: "request", text: words.askedYou.replace("{title}", request.title), taskId: request.id };
    const review = oldest(tasks.filter((t) => isHomeworkToReview(t) && t.assignee_id === member.user_id));
    if (review) return { type: "review", text: review.title, taskId: review.id };
    const asked = oldest(tasks.filter((t) => t.role === "assigner" && isOpen(t) && t.assignee_id === member.user_id));
    if (asked) return { type: "asked", text: words.youAsked.replace("{title}", asked.title), taskId: asked.id, homework: asked.homework };
  }
  let next: { med: CareMed; at: string; time: string } | null = null;
  for (const med of theirs) {
    const dose = nextDose(med);
    if (dose && (!next || dose.due_at < next.at)) next = { med, at: dose.due_at, time: dose.time };
  }
  if (next) return { type: "next", text: words.nextDose.replace("{med}", next.med.name).replace("{time}", words.clock(next.time)), medId: next.med.id };
  return null;
}

/**
 * The rows in the order they are shown: what is most pressing first, then the others as the
 * circle lists them, the reader's own row after people who have something open.
 */
export function memberRows(input: { members: readonly CircleMember[]; tasks: readonly CircleTask[]; care: readonly CareMed[] | null; circleId: string }, words: PeopleWords): { rows: MemberRow[]; more: number } {
  const meds = (input.care ?? []).filter((m) => m.circle_id === input.circleId);
  const names = new Map<string, number>();
  for (const m of input.members) names.set((m.name ?? "").trim(), (names.get((m.name ?? "").trim()) ?? 0) + 1);
  const all = input.members.map((member, i) => ({ member, i, thing: thingFor(member, input.tasks, meds, words, Boolean(member.name?.trim()) && names.get((member.name ?? "").trim()) === 1) }));
  const rank = (r: (typeof all)[number]) => (r.thing ? RANK[r.thing.type] : 5);
  all.sort((a, b) => rank(a) - rank(b) || Number(a.member.is_me) - Number(b.member.is_me) || a.i - b.i);
  const rows = all.slice(0, MAX_MEMBERS).map(({ member, thing }) => ({ member, thing }));
  return { rows, more: all.length - rows.length };
}

/** What a circle's row on People says under its name: how much waits for the reader there, else the next dose today. */
export function circleStatus(circleId: string, tasks: readonly CircleTask[] | null, care: readonly CareMed[] | null): { needs: number; nextDoseTime: string | null } {
  const mine = (tasks ?? []).filter((t) => t.circle_id === circleId);
  const meds = (care ?? []).filter((m) => m.circle_id === circleId);
  const needs = mine.filter((t) => isTaskRequest(t) || isHomeworkToReview(t)).length + meds.reduce((n, m) => n + dosesToAnswer(m).length, 0);
  let next: { at: string; time: string } | null = null;
  for (const med of meds) {
    const dose = nextDose(med);
    if (dose && (!next || dose.due_at < next.at)) next = { at: dose.due_at, time: dose.time };
  }
  return { needs, nextDoseTime: next?.time ?? null };
}
