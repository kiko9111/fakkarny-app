import type { Item } from "../generated/prisma/client";
import type { AppData } from "../chat/actions";
import { toLocalIso } from "../lib/time";
import { normalize } from "../trackers/match";
import type { ReplyLang } from "./rules";

/**
 * Questions about the user's own data, answered by code with the real numbers (owner decision,
 * 2026-11-25: "the AI is for chatting only, the tasks are math"). Used in phone mode, where a
 * 1-2B model can't read a list of plans or month totals reliably: kareem's "What do I have this
 * week?" and "sagelt kam ?" both got "I'm here, tell me more?". Pure: no I/O.
 */
export type Question =
  | { kind: "plans"; range: "today" | "tomorrow" | "week" }
  | { kind: "money" }
  | { kind: "trackers" }
  | { kind: "daftar" };

const PLANS =
  /what('?s| is)? (on|planned|coming)|what do i have|what have i got|my (plans|schedule|agenda|week|day)\b|anything (on )?(today|tomorrow|this week)|عندي ايه|ورايا ايه|ايه اللي ورايا|مواعيدي|خططي|خطتي|جدولي|\b3a?nd[iy]? (eh|eih|eeh)\b|\bwara(ya|ia|yya) (eh|eih|eeh)\b|\bmawa3(ee|i)dy\b|\bplans\b/;
const MONEY =
  /(سجلت|صرفت|دفعت|عملت|كسبت|دخلي|قبضت|\bsagelt|\bsgelt|\bsagalt|\bsrft|\bsraft|\bsaraft|\bdafa3t|\b3amalt|\bkesebt|\bksbt|\b2abadt) ?(كام|\bkam\b|\bkaam\b)|how much (did|have) i|how much (money|income|have i spent|i spent|i earned)|my (spending|income|expenses)|month(ly)? total|total (this month|spending|income)|الاجمالي|اجمالي|\begmaly\b|المصاريف كام|مصاريفي|\bmasareef(y|i)? kam\b/;
const TRACKERS =
  /(شربت|صليت|قريت|ذاكرت|\bshrbt|\bshrebt|\bsharabt) ?(كام|\bkam\b)|how (much|many) (water|cups|glasses|prayers|pages)|كام (كوبايه|كبايه|صلاه)|\bmy streak|الستريك|\bstreak\b/;
const DAFTAR =
  /(مين|\bmeen\b|\bmin\b) (عليه|ليا|عليا|\b3alya\b|\bleya\b|\b3aleh\b)|(عليا|ليا|\b3alya\b|\bleya\b) (كام|\bkam\b)|who owes me|what do i owe|how much do i owe|my debts|ديوني|الدفتر فيه ايه/;

/** Which question, if the message is one; null for anything else (it goes to the usual path). */
export function readQuestion(text: string): Question | null {
  const t = normalize(text).replace(/[ـ]/g, "");
  // "صرفت 300" is a log, not a question. Digits inside Franco words ("3andy", "sa3a") are letters.
  if (t.length > 90 || /(?<![a-z])\d+(?![a-z])/.test(t)) return null;
  if (MONEY.test(t)) return { kind: "money" };
  if (DAFTAR.test(t)) return { kind: "daftar" };
  if (TRACKERS.test(t)) return { kind: "trackers" };
  if (PLANS.test(t)) {
    const range = /tomorrow|بكره|\bbokra\b/.test(t)
      ? "tomorrow"
      : /today|النهارده|\b(e?n+aharda|enharda)\b/.test(t)
        ? "today"
        : "week";
    return { kind: "plans", range };
  }
  return null;
}

const num = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 2 });

function when(
  at: Date,
  tz: string,
  lang: ReplyLang,
  todayLocal: string,
): string {
  const local = toLocalIso(at, tz);
  const day = local.slice(0, 10);
  const clock = local.slice(11, 16);
  const tomorrow = new Date(Date.parse(`${todayLocal}T12:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);
  const dayWord =
    day === todayLocal
      ? lang === "english"
        ? "today"
        : "النهارده"
      : day === tomorrow
        ? lang === "english"
          ? "tomorrow"
          : "بكره"
        : new Intl.DateTimeFormat(lang === "english" ? "en-GB" : "ar-EG", {
            weekday: "long",
            timeZone: tz,
          }).format(at);
  return lang === "english"
    ? `${dayWord} ${clock}`
    : `${dayWord} الساعة ${clock}`;
}

export interface AnswerInput {
  items: Pick<
    Item,
    | "title"
    | "type"
    | "dueAt"
    | "remindAt"
    | "repeatEveryMinutes"
    | "debtPerson"
    | "debtAmount"
    | "debtDirection"
  >[];
  app?: AppData;
  userId: string;
  tz: string;
  now: Date;
}

/** The answer in Zaki's words, one or two bubbles. */
export function answerQuestion(
  q: Question,
  input: AnswerInput,
  lang: ReplyLang,
): string[] {
  const en = lang === "english";
  const { tz, now } = input;
  const todayLocal = toLocalIso(now, tz).slice(0, 10);

  if (q.kind === "plans") {
    const start =
      q.range === "tomorrow"
        ? endOfLocalDay(now, tz)
        : now.getTime() - 60 * 60_000;
    const end =
      q.range === "today"
        ? endOfLocalDay(now, tz)
        : q.range === "tomorrow"
          ? endOfLocalDay(new Date(endOfLocalDay(now, tz) + 60_000), tz)
          : now.getTime() + 7 * 86_400_000;
    const timed = input.items
      .filter((i) => i.type !== "debt")
      .map((i) => ({ i, at: i.dueAt ?? i.remindAt }))
      .filter(
        (x): x is { i: AnswerInput["items"][number]; at: Date } =>
          x.at !== null && x.at.getTime() >= start && x.at.getTime() < end,
      );
    const once = timed
      .filter((x) => !x.i.repeatEveryMinutes)
      .sort((a, b) => a.at.getTime() - b.at.getTime());
    const repeating = new Set(
      timed.filter((x) => x.i.repeatEveryMinutes).map((x) => x.i.title),
    );
    const untimed = input.items.filter(
      (i) => i.type !== "debt" && i.type !== "note" && !i.dueAt && !i.remindAt,
    ).length;
    const span =
      q.range === "today"
        ? en
          ? "today"
          : "النهارده"
        : q.range === "tomorrow"
          ? en
            ? "tomorrow"
            : "بكره"
          : en
            ? "this week"
            : "الأسبوع ده";
    if (!once.length && !repeating.size) {
      const extra = untimed
        ? en
          ? ` You have ${untimed} thing${untimed === 1 ? "" : "s"} with no date yet.`
          : ` عندك ${untimed} حاجة من غير معاد.`
        : "";
      return [
        en
          ? `Nothing booked ${span} 🌿${extra} Want me to remind you of something?`
          : `مفيش حاجة متسجلة ${span} 🌿${extra} عايزني أفكرك بحاجة؟`,
      ];
    }
    const lines = once
      .slice(0, 7)
      .map((x) => `• ${x.i.title} — ${when(x.at, tz, lang, todayLocal)}`);
    if (once.length > 7)
      lines.push(
        en ? `• and ${once.length - 7} more` : `• و${once.length - 7} كمان`,
      );
    if (repeating.size)
      lines.push(
        en
          ? `• Repeating: ${[...repeating].slice(0, 4).join(", ")}`
          : `• بيتكرر: ${[...repeating].slice(0, 4).join("، ")}`,
      );
    const head = en ? `Here's ${span}:` : `ده اللي وراك ${span}:`;
    const tail = untimed
      ? en
        ? `Plus ${untimed} with no date.`
        : `وعندك ${untimed} حاجة من غير معاد.`
      : null;
    return [`${head}\n${lines.join("\n")}`, ...(tail ? [tail] : [])];
  }

  const app = input.app;
  const n = app?.numbers;
  if (q.kind === "money") {
    if (!app || !n || !app.sections.length)
      return [
        en
          ? "Nothing in your Daftar this month yet. Tell me what you spent or earned and I'll log it."
          : "لسه مفيش فلوس متسجلة الشهر ده. قولّي صرفت أو قبضت إيه وأنا أسجله.",
      ];
    const part = (kind: string) =>
      app.sections
        .filter((s) => s.kind === kind)
        .map((s) => ({ name: s.name, total: n.monthSpend[s.id] ?? 0 }))
        .filter((s) => s.total > 0)
        .sort((a, b) => b.total - a.total);
    const income = part("income");
    const spent = part("expense");
    const sum = (xs: { total: number }[]) =>
      xs.reduce((a, b) => a + b.total, 0);
    const list = (xs: { name: string; total: number }[]) =>
      xs
        .slice(0, 4)
        .map((x) => `«${x.name}» ${num(x.total)}`)
        .join(en ? ", " : "، ");
    if (!income.length && !spent.length)
      return [
        en
          ? "Nothing logged this month yet."
          : "لسه مفيش حاجة متسجلة الشهر ده.",
      ];
    const lines: string[] = [];
    if (income.length)
      lines.push(
        en
          ? `Income this month: EGP ${num(sum(income))} (${list(income)})`
          : `دخلك الشهر ده: ${num(sum(income))} جنيه (${list(income)})`,
      );
    if (spent.length)
      lines.push(
        en
          ? `Spent this month: EGP ${num(sum(spent))} (${list(spent)})`
          : `صرفت الشهر ده: ${num(sum(spent))} جنيه (${list(spent)})`,
      );
    return [lines.join("\n")];
  }

  if (q.kind === "trackers") {
    if (!app || !n || !app.trackers.length)
      return [
        en
          ? 'You\'re not tracking anything yet. Say "track my water" to start one.'
          : "لسه مش بنتابع حاجة. قولّي «تابع معايا المية» ونبدأ.",
      ];
    const label = (t: AppData["trackers"][number]) =>
      t.kind === "custom"
        ? (t.name ?? "")
        : en
          ? t.kind
          : (TRACKER_AR[t.kind] ?? t.name ?? t.kind);
    const lines = app.trackers.slice(0, 5).map((t) => {
      const s = n.trackerStats[t.id];
      const goal = t.goal !== null ? `/${num(Number(t.goal))}` : "";
      return en
        ? `• ${label(t)}: ${num(s?.today ?? 0)}${goal} today, ${s?.streak ?? 0}-day streak`
        : `• ${label(t)}: ${num(s?.today ?? 0)}${goal} النهارده، ${s?.streak ?? 0} يوم ورا بعض`;
    });
    return [lines.join("\n")];
  }

  // Daftar: entries from the user's side, plus debts kept as items.
  const rows: string[] = [];
  for (const e of n?.daftar ?? []) {
    const mine = e.creatorId === input.userId;
    const who = mine ? e.otherName : (e.creator?.name ?? "");
    const owedToUser = mine
      ? e.direction === "owed_to_me"
      : e.direction === "i_owe";
    rows.push(
      en
        ? owedToUser
          ? `• ${who} owes you ${num(Number(e.amount))}`
          : `• You owe ${who} ${num(Number(e.amount))}`
        : owedToUser
          ? `• ${who} عليه ${num(Number(e.amount))}`
          : `• عليك ${num(Number(e.amount))} لـ${who}`,
    );
  }
  for (const i of input.items.filter(
    (x) => x.type === "debt" && x.debtPerson && x.debtAmount !== null,
  )) {
    const amount = num(Number(i.debtAmount));
    rows.push(
      en
        ? i.debtDirection === "i_owe"
          ? `• You owe ${i.debtPerson} ${amount}`
          : `• ${i.debtPerson} owes you ${amount}`
        : i.debtDirection === "i_owe"
          ? `• عليك ${amount} لـ${i.debtPerson}`
          : `• ${i.debtPerson} عليه ${amount}`,
    );
  }
  if (!rows.length)
    return [
      en ? "No open debts. All clear 👌" : "مفيش ديون مفتوحة، كله تمام 👌",
    ];
  return [`${en ? "Open debts:" : "الدفتر:"}\n${rows.slice(0, 8).join("\n")}`];
}

const TRACKER_AR: Record<string, string> = {
  water: "المية",
  prayer: "الصلاة",
  gym: "الجيم",
  quran: "القرآن",
  medicine: "الدوا",
  study: "المذاكرة",
  spending: "المصاريف",
  fasting: "الصيام",
  charity: "الصدقة",
  savings: "التحويش",
};

/** End of the local day `at` falls in, as epoch ms. */
function endOfLocalDay(at: Date, tz: string): number {
  const local = toLocalIso(at, tz); // "YYYY-MM-DDTHH:mm"
  const h = Number(local.slice(11, 13));
  const m = Number(local.slice(14, 16));
  const minuteStart = at.getTime() - (at.getTime() % 60_000);
  return minuteStart + ((23 - h) * 60 + (60 - m)) * 60_000;
}
