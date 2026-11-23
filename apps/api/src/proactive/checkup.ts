import type { ReplyLang } from "../pipeline/rules";

/**
 * The Friday life check-up (owner ask, 2026-11-23: "audit your life"). Once a week, Friday late
 * morning local time, Zaki looks back at the week in a few honest lines and asks one question for
 * the week ahead. Template words only, no AI call, nothing invented, no guilt: unfinished things are
 * offered a way out ("finish or move them?"), never counted against the user.
 */
export const CHECKUP_WEEKDAY = 5; // Friday, the weekend in Egypt
export const CHECKUP_FROM_HOUR = 11;
export const CHECKUP_UNTIL_HOUR = 14;

export interface CheckupInput {
  /** Reminders and tasks marked done in the last 7 days. */
  done: number;
  /** Open reminders and tasks whose time passed. */
  overdue: number;
  /** Open reminders and tasks due in the next 7 days. */
  upcoming: number;
  /** Open debts: people who owe the user, and people the user owes. */
  owedToMe: number;
  iOwe: number;
  /** Days this week with at least one tracker log, for the user's best tracker (0 = none). */
  trackerDays: number;
  trackerName: string | null;
}

/** Friday, inside the window, from a local ISO wall-clock time ("2026-11-27T11:30"). */
export function isCheckupTime(localIso: string): boolean {
  const d = new Date(`${localIso.slice(0, 10)}T00:00:00Z`).getUTCDay();
  const hour = Number(localIso.slice(11, 13));
  return d === CHECKUP_WEEKDAY && hour >= CHECKUP_FROM_HOUR && hour < CHECKUP_UNTIL_HOUR;
}

export const checkupClientId = (localDay: string) => `checkup:${localDay}`;

/** Nothing happened and nothing is coming: skip the week rather than send an empty review. */
export const hasSomething = (c: CheckupInput) => c.done + c.overdue + c.upcoming + c.owedToMe + c.iOwe + c.trackerDays > 0;

export function checkupLines(lang: ReplyLang, c: CheckupInput): string[] {
  const ar = lang !== "english";
  const lines = [ar ? "🌿 مراجعة الجمعة: أسبوعك في دقيقة" : "🌿 Friday check-up: your week in a minute"];
  if (c.done > 0) lines.push(ar ? `خلصت ${c.done} ${c.done === 1 ? "حاجة" : "حاجات"} الأسبوع ده 👏` : `You finished ${c.done} ${c.done === 1 ? "thing" : "things"} this week 👏`);
  if (c.trackerDays > 0 && c.trackerName) lines.push(ar ? `«${c.trackerName}»: ${c.trackerDays} من ٧ أيام 💪` : `“${c.trackerName}”: ${c.trackerDays} of 7 days 💪`);
  if (c.overdue > 0)
    lines.push(ar ? `فيه ${c.overdue} ${c.overdue === 1 ? "حاجة وقتها عدّى" : "حاجات وقتها عدّى"}. نخلصها ولا نأجلها؟ قولي وأنا أظبط.` : `${c.overdue} ${c.overdue === 1 ? "thing is" : "things are"} past their time. Finish or move? Tell me and I'll sort it.`);
  if (c.upcoming > 0) lines.push(ar ? `الأسبوع الجاي عندك ${c.upcoming} ${c.upcoming === 1 ? "حاجة" : "حاجات"} متسجلة، وأنا هفكّرك بيهم.` : `Next week you have ${c.upcoming} ${c.upcoming === 1 ? "thing" : "things"} lined up, and I'll remind you.`);
  if (c.owedToMe > 0) lines.push(ar ? `ليك فلوس عند ${c.owedToMe} ${c.owedToMe === 1 ? "شخص" : "أشخاص"} في الدفتر.` : `${c.owedToMe} ${c.owedToMe === 1 ? "person owes" : "people owe"} you in the Daftar.`);
  if (c.iOwe > 0) lines.push(ar ? `وعليك لـ${c.iOwe} ${c.iOwe === 1 ? "شخص" : "أشخاص"}.` : `And you owe ${c.iOwe} ${c.iOwe === 1 ? "person" : "people"}.`);
  lines.push(ar ? "إيه أهم حاجة عايز تخلصها الأسبوع الجاي؟ قولهالي وأنا أفكّرك 💛" : "What's the one thing you most want to get done next week? Tell me and I'll remind you 💛");
  return lines;
}
