import { nextDose, roundState, myMember, phaseOf, type CareMed, type Gameya, type Item } from "@fakkarni/shared";
import { comingUp, STILL_NOW_MS } from "@/lib/coming-up";
import type { NeedRow } from "./needs";

/**
 * Today at a glance (design round 2, "The Glance"): three numbers on top, a capped inbox, a
 * capped list of plans. Pure: what is counted, what is shown first, what is late.
 */

/** "Needs you" shows this many rows before "+N more". */
export const MAX_NEEDS = 4;
/** Plans shown under an inbox, and when nothing waits. */
export const MAX_PLANS_BESIDE_NEEDS = 3;
export const MAX_PLANS = 5;

export type GlanceFilter = "needs" | "plans" | "late";

/** What comes first in the inbox: a dose nobody marked, money that is late or due today, then requests, reviews and the rest. */
const rank = (n: Pick<NeedRow, "kind" | "tone">): number => {
  if (n.kind === "dose") return 0;
  if (n.kind === "gameya" && n.tone) return 1;
  if (n.kind === "task") return 2;
  if (n.kind === "homework_review") return 3;
  if (n.kind === "daftar") return 4;
  if (n.kind === "split") return 5;
  return 6;
};

/** The inbox in the order it is shown (the oldest first inside a kind, as `needsYou` gives them). */
export function rankNeeds<N extends Pick<NeedRow, "kind" | "tone">>(rows: readonly N[]): N[] {
  return rows.map((row, i) => ({ row, i })).sort((a, b) => rank(a.row) - rank(b.row) || a.i - b.i).map((x) => x.row);
}

/** A one-off plan whose every time passed more than an hour ago and is still open. */
export function isLatePlan(item: Pick<Item, "remind_at" | "due_at" | "repeat_every_minutes">, now: Date): boolean {
  if (item.repeat_every_minutes) return false;
  const times = [item.remind_at, item.due_at].flatMap((at) => {
    const ms = at ? Date.parse(at) : Number.NaN;
    return Number.isFinite(ms) ? [ms] : [];
  });
  return times.length > 0 && times.every((ms) => ms < now.getTime() - STILL_NOW_MS);
}

/**
 * The plans in the order Today shows them: the newest late one keeps the first place (it is the
 * one most likely forgotten), then what is ahead soonest first, plans with no time, the repeating
 * ones, and the older late ones last.
 */
export function glancePlans(items: Item[], now: Date): { rows: Item[]; late: Item[] } {
  const { soon, repeating } = comingUp(items, now, Number.MAX_SAFE_INTEGER);
  const late = soon.filter((i) => isLatePlan(i, now));
  const lateIds = new Set(late.map((i) => i.id));
  const rest = soon.filter((i) => !lateIds.has(i.id));
  return { rows: [...late.slice(0, 1), ...rest, ...repeating, ...late.slice(1)], late };
}

/** What a filter leaves on the screen. */
export function shown<N, P>(filter: GlanceFilter | null, needs: readonly N[], plans: readonly P[], late: readonly P[], expanded: boolean): { needs: N[]; moreNeeds: number; plans: P[]; morePlans: number } {
  if (filter === "needs") return { needs: [...needs], moreNeeds: 0, plans: [], morePlans: 0 };
  if (filter === "plans") return { needs: [], moreNeeds: 0, plans: [...plans], morePlans: 0 };
  if (filter === "late") return { needs: [], moreNeeds: 0, plans: [...late], morePlans: 0 };
  const needRows = expanded ? [...needs] : needs.slice(0, MAX_NEEDS);
  const planRows = plans.slice(0, needs.length ? MAX_PLANS_BESIDE_NEEDS : MAX_PLANS);
  return { needs: needRows, moreNeeds: needs.length - needRows.length, plans: planRows, morePlans: plans.length - planRows.length };
}

export interface NextWords {
  /** "Next dose {time} · {name}" */
  dose: string;
  /** "Your gam'eya turn · {name}" */
  turn: string;
  clock: (hhmm: string) => string;
}

/**
 * The one line beside the date: the next medicine dose still to come today, else a gam'eya round
 * in which the pot is this person's. Null when neither; the screen then says the holiday, if any.
 */
export function nextLine(input: { care?: readonly CareMed[] | null; gameyas?: readonly Gameya[] | null }, words: NextWords): { text: string; route: string } | null {
  let best: { med: CareMed; at: string; time: string } | null = null;
  for (const med of input.care ?? []) {
    const dose = nextDose(med);
    if (dose && (!best || dose.due_at < best.at)) best = { med, at: dose.due_at, time: dose.time };
  }
  if (best) return { text: words.dose.replace("{time}", words.clock(best.time)).replace("{name}", best.med.person_name), route: `/circle/care?id=${encodeURIComponent(best.med.circle_id)}` };
  for (const g of input.gameyas ?? []) {
    if (phaseOf(g) !== "running") continue;
    const me = myMember(g);
    const receiver = roundState(g, g.round).receiver;
    if (me && receiver && receiver.id === me.id && !receiver.received) return { text: words.turn.replace("{name}", g.name), route: `/gameya/${encodeURIComponent(g.id)}` };
  }
  return null;
}

/** How a plan's day is said: today shows the clock alone, tomorrow its word, anything else the weekday. */
export function dayOf(iso: string, now: Date): "today" | "tomorrow" | "other" {
  const d = new Date(iso);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day - start) / 86_400_000);
  return diff === 0 ? "today" : diff === 1 ? "tomorrow" : "other";
}
