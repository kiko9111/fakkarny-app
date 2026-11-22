import { TRACKER_TEMPLATES, TrackerKind } from "@fakkarni/shared";
import { isAwake, localParts, minutesOf, toLocalIso } from "../lib/time";
import type { ReplyLang } from "../pipeline/rules";

/**
 * Status checks: Zaki asks how things stand on its own ("Did you get to calling mum?",
 * "Did Ahmed pay you back?", "Did you drink water today?"), so the user's lists stay true
 * without them having to report. Pure: code picks the subject and the words come from
 * templates, so a status check never costs an AI call. A plain "yes" answer is closed by rules
 * too (`answerStatus`); anything else goes to the model, which sees the question in the chat.
 *
 * Not nagging: waking hours only, away from the morning and night messages, never while the
 * user is mid-conversation, at most MAX_PER_DAY a day and SPACING_MIN apart, each subject
 * asked again only after its cool-down, and a pause of BACKOFF_H after IGNORED_BEFORE_BACKOFF
 * status checks in a row went unanswered.
 */

export const MAX_PER_DAY = 2;
export const SPACING_MIN = 180;
export const IGNORED_BEFORE_BACKOFF = 2;
export const BACKOFF_H = 48;
/** The user wrote this recently: they're talking already, don't interrupt with a question. */
export const QUIET_AFTER_USER_MIN = 30;
/** A reminder whose time passed this long ago, and is still open, gets a "did you?". */
export const PASSED_AFTER_MIN = 45;
export const PASSED_UNTIL_DAYS = 3;
export const DEBT_AFTER_DAYS = 7;
export const UNTIMED_TASK_AFTER_DAYS = 3;
/** Days before the same subject can be asked about again. */
export const COOLDOWN_DAYS = { reminder: 3, debt: 7, task: 4, tracker: 2 } as const;
/** Trackers are asked about in the evening, when a day with nothing logged is still saveable. */
export const TRACKER_FROM_HOUR = 18;
/** How long after a status check a short "yes" still answers it. */
export const ANSWER_WINDOW_H = 12;

export interface StatusItem {
  id: string;
  type: string;
  title: string;
  status: string;
  remindAt: Date | null;
  dueAt: Date | null;
  repeatEveryMinutes: number | null;
  followUpAt: Date | null;
  debtPerson: string | null;
  debtAmount: number | null;
  debtDirection: string | null;
  createdAt: Date;
}

export interface StatusTracker {
  id: string;
  kind: string;
  loggedToday: number;
}

/** A status check Zaki already sent, newest first. */
export interface PastCheck {
  subject: string;
  at: Date;
  answered: boolean;
}

export interface StatusInput {
  now: Date;
  timezone: string;
  wakeTime: string;
  sleepTime: string;
  lastUserMessageAt: Date | null;
  items: StatusItem[];
  trackers: StatusTracker[];
  /** Status checks from the last COOLDOWN_DAYS.debt days, newest first. */
  history: PastCheck[];
}

export interface StatusCheck {
  /** "item:<id>" or "tracker:<id>": stored in the message client_id so the answer finds it. */
  subject: string;
  text: Record<ReplyLang, string>;
}

const DAY = 86400_000;
const minutesNow = (d: Date, tz: string) => {
  const p = localParts(d, tz);
  return p.hour * 60 + p.minute;
};
const forward = (from: number, to: number) => (to - from + 1440) % 1440;
const dayKey = (d: Date, tz: string) => toLocalIso(d, tz).slice(0, 10);
const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/** Kinds Zaki can ask "did you … today?" about, and log one step for on "yes". */
export const ASKABLE_TRACKERS: Partial<Record<TrackerKind, Record<ReplyLang, string>>> = {
  water: { arabic: "شربت مية النهارده؟ 💧", english: "Have you had some water today? 💧" },
  prayer: { arabic: "صلّيت النهارده؟ 🤲", english: "Did you get to pray today? 🤲" },
  gym: { arabic: "اتمرّنت النهارده؟ 💪", english: "Did you work out today? 💪" },
  quran: { arabic: "قريت قرآن النهارده؟ 📖", english: "Did you read some Quran today? 📖" },
  medicine: { arabic: "خدت الدوا النهارده؟ 💊", english: "Did you take your medicine today? 💊" },
  study: { arabic: "ذاكرت النهارده؟ 📚", english: "Did you get some studying done today? 📚" },
  fasting: { arabic: "صايم النهارده؟ 🌙", english: "Are you fasting today? 🌙" },
};

function itemQuestion(i: StatusItem): Record<ReplyLang, string> {
  if (i.type === "debt" && i.debtPerson) {
    const amount = i.debtAmount ? num(i.debtAmount) : null;
    if (i.debtDirection === "i_owe") {
      return {
        arabic: amount ? `سدّدت الـ${amount} لـ${i.debtPerson}؟` : `خلّصت حسابك مع ${i.debtPerson}؟`,
        english: amount ? `Did you settle the ${amount} with ${i.debtPerson}?` : `Did you settle up with ${i.debtPerson}?`,
      };
    }
    return {
      arabic: amount ? `${i.debtPerson} رجّعلك الـ${amount}؟` : `${i.debtPerson} رجّعلك فلوسك؟`,
      english: amount ? `Did ${i.debtPerson} pay you back the ${amount}?` : `Did ${i.debtPerson} pay you back?`,
    };
  }
  return { arabic: `عملت «${i.title}»؟ 🙂`, english: `Did you get to “${i.title}”? 🙂` };
}

export function planStatusCheck(input: StatusInput): StatusCheck | null {
  const { now, timezone: tz } = input;
  if (!isAwake(now, tz, input.wakeTime, input.sleepTime)) return null;
  const nowMin = minutesNow(now, tz);
  // The morning message and the night chat already talk about the day.
  if (forward(minutesOf(input.wakeTime), nowMin) < 60 || forward(nowMin, minutesOf(input.sleepTime)) < 90) return null;
  if (input.lastUserMessageAt && now.getTime() - input.lastUserMessageAt.getTime() < QUIET_AFTER_USER_MIN * 60_000) return null;

  const history = input.history;
  const today = dayKey(now, tz);
  if (history.filter((h) => dayKey(h.at, tz) === today).length >= MAX_PER_DAY) return null;
  const last = history[0];
  if (last && now.getTime() - last.at.getTime() < SPACING_MIN * 60_000) return null;
  // Back off when the last few went unanswered: they're busy, not forgetful.
  const ignoredRun = history.findIndex((h) => h.answered);
  const ignored = ignoredRun === -1 ? history.length : ignoredRun;
  if (ignored >= IGNORED_BEFORE_BACKOFF && last && now.getTime() - last.at.getTime() < BACKOFF_H * 3600_000) return null;

  const askedWithin = (subject: string, days: number) => history.some((h) => h.subject === subject && now.getTime() - h.at.getTime() < days * DAY);
  const open = input.items.filter((i) => i.status === "open" && !i.repeatEveryMinutes);

  // 1. A reminder or task whose time has passed and is still open.
  const passed = open
    .filter((i) => (i.type === "reminder" || i.type === "task") && !i.followUpAt)
    .map((i) => ({ i, at: i.remindAt ?? i.dueAt }))
    .filter((x): x is { i: StatusItem; at: Date } => !!x.at && now.getTime() - x.at.getTime() >= PASSED_AFTER_MIN * 60_000 && now.getTime() - x.at.getTime() <= PASSED_UNTIL_DAYS * DAY)
    .filter((x) => !askedWithin(`item:${x.i.id}`, COOLDOWN_DAYS.reminder))
    .sort((a, b) => b.at.getTime() - a.at.getTime())[0];
  if (passed) return { subject: `item:${passed.i.id}`, text: itemQuestion(passed.i) };

  // 2. A debt that has been open for a week.
  const debt = open
    .filter((i) => i.type === "debt" && i.debtPerson && now.getTime() - i.createdAt.getTime() >= DEBT_AFTER_DAYS * DAY)
    .filter((i) => !askedWithin(`item:${i.id}`, COOLDOWN_DAYS.debt))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
  if (debt) return { subject: `item:${debt.id}`, text: itemQuestion(debt) };

  // 3. A task with no time that has been sitting for a few days.
  const task = open
    .filter((i) => i.type === "task" && !i.remindAt && !i.dueAt && now.getTime() - i.createdAt.getTime() >= UNTIMED_TASK_AFTER_DAYS * DAY)
    .filter((i) => !askedWithin(`item:${i.id}`, COOLDOWN_DAYS.task))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
  if (task) return { subject: `item:${task.id}`, text: itemQuestion(task) };

  // 4. In the evening, a tracker with nothing logged today.
  if (localParts(now, tz).hour >= TRACKER_FROM_HOUR) {
    const tracker = input.trackers.find((t) => t.loggedToday === 0 && ASKABLE_TRACKERS[t.kind as TrackerKind] && TRACKER_TEMPLATES[t.kind as TrackerKind]?.step && !askedWithin(`tracker:${t.id}`, COOLDOWN_DAYS.tracker));
    if (tracker) return { subject: `tracker:${tracker.id}`, text: ASKABLE_TRACKERS[tracker.kind as TrackerKind]! };
  }
  return null;
}

/** A tracker with times the user picked for Zaki to ask about it. */
export interface AskTracker {
  id: string;
  kind: string;
  name: string | null;
  askTimes: string[];
  goal: number | null;
  today: number;
}

/** How long after a picked time the question may still go out (the tick runs every minute). */
export const ASK_WINDOW_MIN = 30;

const MONEY_ASK: Record<ReplyLang, string> = { arabic: "صرفت كام النهارده؟ قولّي وأنا أسجّل 🧾", english: "How much did you spend today? Tell me and I'll log it 🧾" };

/** The question for a tracker: the template's, or the user's own name for a builder tracker. */
export function trackerQuestion(t: Pick<AskTracker, "kind" | "name">): Record<ReplyLang, string> {
  const kind = TrackerKind.catch("custom").parse(t.kind);
  if (TRACKER_TEMPLATES[kind].unit === "money") return MONEY_ASK;
  const own = ASKABLE_TRACKERS[kind];
  if (own) return own;
  const name = t.name ?? "";
  return { arabic: `عملت «${name}» النهارده؟ 🌟`, english: `Did you do “${name}” today? 🌟` };
}

/**
 * Questions at the times the user picked in the tracker builder. They asked for these, so the
 * daily cap and spacing of unprompted status checks do not apply; waking hours still do, and a
 * day whose goal is already met is not asked about.
 */
export function trackerAskDue(trackers: AskTracker[], now: Date, tz: string, wakeTime: string, sleepTime: string, history: Pick<PastCheck, "subject" | "at">[]): StatusCheck | null {
  if (!isAwake(now, tz, wakeTime, sleepTime)) return null;
  const nowMin = minutesNow(now, tz);
  for (const t of trackers) {
    const met = t.goal === null ? t.today > 0 : t.today >= t.goal;
    if (met) continue;
    for (const slot of t.askTimes) {
      const since = forward(minutesOf(slot), nowMin);
      if (since >= ASK_WINDOW_MIN) continue;
      const slotStart = now.getTime() - (since + 1) * 60_000;
      if (history.some((h) => h.subject === `tracker:${t.id}` && h.at.getTime() >= slotStart)) continue;
      return { subject: `tracker:${t.id}`, text: trackerQuestion(t) };
    }
  }
  return null;
}

/** client_id of a status-check message: status:<item|tracker>:<id>:<iso time>. */
export const statusClientId = (subject: string, now: Date) => `status:${subject}:${now.toISOString()}`;

export function parseStatusClientId(clientId: string | null): { kind: "item" | "tracker"; id: string } | null {
  const m = clientId?.match(/^status:(item|tracker):([0-9a-f-]{36}):/);
  return m ? { kind: m[1] as "item" | "tracker", id: m[2]! } : null;
}

const YES = new Set([
  "اه", "آه", "أه", "ايوه", "أيوه", "ايوة", "أيوة", "اكيد", "أكيد", "يب", "تمام", "خلصت", "خلصتها", "خلصته", "عملت", "عملتها", "عملته", "تم", "خلاص",
  "رجعهم", "رجعلي", "رجعها", "دفع", "دفعت", "سددت", "شربت", "صليت", "اتمرنت", "خدته", "خدت", "قريت", "ذاكرت", "صايم", "الحمد", "لله", "الحمدلله", "والله",
  "يا", "زكي", "شكرا", "yes", "yeah", "yep", "yup", "ya", "done", "did", "it", "i", "sure", "of", "course", "already", "all", "good", "paid", "zaki", "thanks",
]);
const ANSWER_WORDS = new Set([...YES].filter((w) => !["يا", "زكي", "شكرا", "الحمد", "لله", "والله", "it", "i", "of", "all", "zaki", "thanks"].includes(w)));

/** "اه" / "خلصت ✅" / "yes done": a short, plain yes with no "not", "still", or anything else in it. */
export function isPlainYes(text: string): boolean {
  const words = text
    .toLowerCase()
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length || words.length > 5) return false;
  return words.every((w) => YES.has(w)) && words.some((w) => ANSWER_WORDS.has(w));
}

const DONE_REPLY: Record<ReplyLang, (title: string) => string> = {
  arabic: (title) => `برافو عليك! علّمت «${title}» إنها خلصت ✅`,
  english: (title) => `Nice one! Marked “${title}” as done ✅`,
};
const SETTLED_REPLY: Record<ReplyLang, string> = {
  arabic: "حلو أوي! علّمتها إنها اتسدّت ✅",
  english: "Love that! Marked it as settled ✅",
};
export const statusDoneReply = (lang: ReplyLang, item: { type: string; title: string }) => (item.type === "debt" ? SETTLED_REPLY[lang] : DONE_REPLY[lang](item.title));

/** Whether the latest friend message is a status check recent enough for this answer to be about it. */
export function pendingStatus(lastFriend: { clientId: string | null; createdAt: Date } | null, now: Date): { kind: "item" | "tracker"; id: string } | null {
  if (!lastFriend || now.getTime() - lastFriend.createdAt.getTime() > ANSWER_WINDOW_H * 3600_000) return null;
  return parseStatusClientId(lastFriend.clientId);
}
