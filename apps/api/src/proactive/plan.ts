import { isAwake, localParts, minutesOf, toLocalIso } from "../lib/time";

/**
 * Decide whether the friend should start a conversation right now, and about what
 * (PRD F3 morning, F4 night, F6 follow-ups, F7 check-ins; FR-5, FR-7).
 * Pure: "code decides what is due"; the AI only writes the words.
 */

export type ProactiveKind = "morning" | "night" | "checkin" | "followup";

export interface PlanUser {
  timezone: string;
  wakeTime: string;
  sleepTime: string;
  checkinIntervalH: "h2" | "h4" | "off";
  ignoredCheckins: number;
  slowdownNoticed: boolean;
  lastMorningAt: Date | null;
  lastNightAt: Date | null;
  lastCheckinAt: Date | null;
  lastUserMessageAt: Date | null;
}

export interface PlanItem {
  id: string;
  type: string;
  title: string;
  status: string;
  dueAt: Date | null;
  important: boolean;
  followUpAt: Date | null;
  followedUpAt: Date | null;
}

export interface PlanInput {
  user: PlanUser;
  now: Date;
  /** Open items plus done items still awaiting a follow-up. */
  items: PlanItem[];
  /** Friend-started questions today outside the scheduled morning/night messages. */
  unpromptedToday: number;
}

export interface ProactivePlan {
  kind: ProactiveKind;
  /** Items this message is about (follow-ups mark them as followed up). */
  itemIds: string[];
  /** Plain facts for the writer; never invented, only what code found. */
  facts: string[];
  /** Mention once that check-ins will slow down (F7). */
  slowdownNotice: boolean;
}

export const MORNING_WINDOW_MIN = 30;
export const NIGHT_LEAD_MIN = 60;
export const MAX_UNPROMPTED_PER_DAY = 3;
export const IGNORED_BEFORE_SLOWDOWN = 3;
/** Don't start a check-in if the user wrote within this window: they're already talking. */
export const RECENT_ACTIVITY_MIN = 60;

const dayKey = (d: Date, tz: string) => toLocalIso(d, tz).slice(0, 10);
const sameLocalDay = (a: Date | null, b: Date, tz: string) => (a ? dayKey(a, tz) === dayKey(b, tz) : false);
const minutesNow = (d: Date, tz: string) => {
  const p = localParts(d, tz);
  return p.hour * 60 + p.minute;
};
/** Minutes from `from` to `to` going forward around the clock (0–1439). */
const forward = (from: number, to: number) => (to - from + 1440) % 1440;
const hhmm = (d: Date, tz: string) => toLocalIso(d, tz).slice(11);

function describe(i: PlanItem, tz: string): string {
  const when = i.dueAt ? ` at ${hhmm(i.dueAt, tz)} on ${dayKey(i.dueAt, tz)}` : "";
  return `${i.type} "${i.title}"${when}${i.important ? " (important)" : ""}`;
}

export function effectiveIntervalMin(user: PlanUser): number | null {
  if (user.checkinIntervalH === "off") return null;
  const base = user.checkinIntervalH === "h4" ? 240 : 120;
  return user.ignoredCheckins >= IGNORED_BEFORE_SLOWDOWN ? Math.max(base, 240) : base;
}

export function planProactive(input: PlanInput): ProactivePlan | null {
  const { user, now, items } = input;
  const tz = user.timezone;
  const nowMin = minutesNow(now, tz);
  const wake = minutesOf(user.wakeTime);
  const sleep = minutesOf(user.sleepTime);
  const awake = isAwake(now, tz, user.wakeTime, user.sleepTime);
  const open = items.filter((i) => i.status === "open");
  const today = dayKey(now, tz);
  const dueToday = open.filter((i) => i.dueAt && dayKey(i.dueAt, tz) === today);

  // F6 follow-ups first: "How was the dentist?" once the event has passed.
  // Not counted against the daily cap: the user asked for this event to be remembered, and
  // the phone has a local notification waiting at the same moment.
  if (awake) {
    const due = items
      .filter((i) => i.followUpAt && !i.followedUpAt && i.followUpAt <= now && i.status !== "cancelled")
      .sort((a, b) => a.followUpAt!.getTime() - b.followUpAt!.getTime())[0];
    if (due) {
      return {
        kind: "followup",
        itemIds: [due.id],
        facts: [
          `Ask how this went: ${describe(due, tz)}. Status: ${due.status}.`,
          "Make the question specific to that kind of event, the way a friend who cares would (after a dentist: did it hurt? after an exam: was it hard? after a meeting: did it go your way?).",
        ],
        slowdownNotice: false,
      };
    }
  }

  // F3 good morning, within 30 min after wake time, once per local day.
  if (forward(wake, nowMin) < MORNING_WINDOW_MIN && !sameLocalDay(user.lastMorningAt, now, tz)) {
    return {
      kind: "morning",
      itemIds: dueToday.map((i) => i.id),
      facts: dueToday.length
        ? [`Today's plans (hint at them indirectly, as a question, no list): ${dueToday.map((i) => describe(i, tz)).join("; ")}`]
        : ["You know nothing about today yet. Say good morning and ask what the plan is today."],
      slowdownNotice: false,
    };
  }

  // F4 night chat, from 1 hour before sleep, once per local day.
  const toSleep = forward(nowMin, sleep);
  if (toSleep <= NIGHT_LEAD_MIN && toSleep > 0 && !sameLocalDay(user.lastNightAt, now, tz)) {
    const missed = dueToday.filter((i) => i.dueAt! <= now);
    const tomorrow = dayKey(new Date(now.getTime() + 24 * 3600_000), tz);
    const tomorrowItems = open.filter((i) => i.dueAt && dayKey(i.dueAt, tz) === tomorrow);
    const facts = ["Ask how today went."];
    if (missed.length) facts.push(`Still open from today (raise ONE as a question, e.g. offer to move it to tomorrow): ${missed.map((i) => describe(i, tz)).join("; ")}`);
    if (tomorrowItems.length) facts.push(`Tomorrow: ${tomorrowItems.map((i) => describe(i, tz)).join("; ")}`);
    else facts.push("Nothing known for tomorrow: you may ask if there's anything for tomorrow they don't want to forget.");
    return { kind: "night", itemIds: missed.map((i) => i.id), facts, slowdownNotice: false };
  }

  // F7 daytime check-ins: every 2h (4h when slowed), never without a reason.
  const interval = effectiveIntervalMin(user);
  if (interval === null || !awake || input.unpromptedToday >= MAX_UNPROMPTED_PER_DAY) return null;
  if (forward(wake, nowMin) < 60 || forward(nowMin, sleep) < 90) return null; // morning/night cover these
  const last = [user.lastCheckinAt, user.lastMorningAt, user.lastUserMessageAt]
    .filter((d): d is Date => d !== null)
    .reduce<Date | null>((a, b) => (!a || b > a ? b : a), null);
  if (user.lastUserMessageAt && now.getTime() - user.lastUserMessageAt.getTime() < RECENT_ACTIVITY_MIN * 60_000) return null;
  if (last && now.getTime() - last.getTime() < interval * 60_000) return null;

  const soon = open
    .filter((i) => i.dueAt && i.dueAt > now && i.dueAt.getTime() - now.getTime() <= 3 * 3600_000)
    .sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime())[0];
  const slowdownNotice = user.ignoredCheckins >= IGNORED_BEFORE_SLOWDOWN && !user.slowdownNoticed;
  const facts: string[] = [];
  let itemIds: string[] = [];
  if (soon) {
    facts.push(`Coming up: ${describe(soon, tz)}. Bring it to mind indirectly with a question (e.g. "Did you manage to eat before the 4 o'clock meeting?").`);
    itemIds = [soon.id];
  } else {
    // A question that draws out plans is a purpose too (PRD F2b/F7), once per day at most.
    const asked = user.lastCheckinAt && sameLocalDay(user.lastCheckinAt, now, tz);
    if (asked) return null;
    facts.push(nowMin >= 15 * 60 ? 'Ask what they are up to this evening.' : "Ask if anything big is coming up this week they'd like you to remember.");
  }
  if (slowdownNotice) facts.push("Also mention, once and lightly, that you'll check in a bit less often since they're busy (no guilt).");
  return { kind: "checkin", itemIds, facts, slowdownNotice };
}
