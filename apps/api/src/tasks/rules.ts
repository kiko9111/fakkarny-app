import { TrackerKind } from "@fakkarni/shared";
import { trackerLabel } from "../trackers/labels";
import type { TaskRole, TaskStatus } from "@fakkarni/shared";

/** Pure rules and wording for assigned tasks. No AI: every line here is a template. */
export type Lang = "ar" | "en";
export type TaskEvent = "task_accepted" | "task_done";

/** The assigner can ask Zaki to nudge at most this often, and this many times per task. */
export const NUDGE_GAP_HOURS = 12;
export const MAX_NUDGES = 3;
/** Open tasks one person can have waiting on one other person (stops a flood, not real use). */
export const MAX_OPEN_PER_PAIR = 30;

export const canRespond = (status: TaskStatus, role: TaskRole) => status === "pending" && role === "assignee";
export const canFinish = (status: TaskStatus, role: TaskRole) => status === "accepted" && role === "assignee";
/** The assigner picks the reminder time while asking; once it is theirs, the assignee decides. */
export const canSetRemind = (status: TaskStatus, role: TaskRole) => (role === "assigner" && status === "pending") || (role === "assignee" && (status === "pending" || status === "accepted"));
export const canCancel = (status: TaskStatus, role: TaskRole) => role === "assigner" && (status === "pending" || status === "accepted");

/** Nudges go only to a task that is still open, and never in a burst. */
export function canNudge(t: { status: TaskStatus; nudges: number; lastNudgeAt: Date | null; createdAt: Date }, role: TaskRole, now: Date): boolean {
  if (role !== "assigner" || (t.status !== "pending" && t.status !== "accepted")) return false;
  if (t.nudges >= MAX_NUDGES) return false;
  const since = (t.lastNudgeAt ?? t.createdAt).getTime();
  return now.getTime() - since >= NUDGE_GAP_HOURS * 3600_000;
}

const someone = (lang: Lang) => (lang === "en" ? "Someone in your circle" : "حد من دايرتك");
const nameOr = (name: string | null | undefined, lang: Lang) => name?.trim() || someone(lang);

/** What Zaki says in a person's own chat. Arabic lines avoid gendered verbs about the other person. `name` is the other person. */
export function taskLine(lang: Lang, kind: "asked" | "accepted" | "declined" | "done" | "cancelled" | "nudge_pending" | "nudge_accepted", name: string | null | undefined, title: string, circle: string): string {
  const n = nameOr(name, lang);
  if (lang === "en") {
    switch (kind) {
      case "asked":
        return `${n} is asking you for something in «${circle}»: ${title}. Up to you, say yes only if it works for you 🌟`;
      case "accepted":
        return `Good news! ${n} said yes to: ${title} 🙌`;
      case "declined":
        return `${n} can't take this one right now: ${title}. No worries, we'll find another way 💛`;
      case "done":
        return `${n} finished: ${title} ✅ A thank-you would make their day!`;
      case "cancelled":
        return `${n} doesn't need this any more: ${title}. One less thing on your plate 😌`;
      case "nudge_pending":
        return `${n} is still waiting for your answer about: ${title}. A yes or a no are both fine 💛`;
      case "nudge_accepted":
        return `A gentle reminder from ${n}: ${title}. You've got this 💪`;
    }
  }
  switch (kind) {
    case "asked":
      return `طلب من ${n} في «${circle}»: ${title}. براحتك، وافق بس لو ينفع معاك 🌟`;
    case "accepted":
      return `خبر حلو! الرد من ${n} على «${title}»: تمام 🙌`;
    case "declined":
      return `الرد من ${n} على «${title}»: مش هينفع دلوقتي. ولا يهمك، هنلاقي حل تاني 💛`;
    case "done":
      return `تمّت: ${title} ✅ بإيد ${n}. كلمة شكر هتفرق!`;
    case "cancelled":
      return `مبقاش فيه داعي لـ: ${title} (من ${n}). حاجة أقل عليك 😌`;
    case "nudge_pending":
      return `${n} في انتظار ردك على: ${title}. أيوه أو لأ، الاتنين تمام 💛`;
    case "nudge_accepted":
      return `تذكير لطيف من ${n}: ${title}. إنت قدّها 💪`;
  }
}

/** What Zaki posts in the circle for everyone, in the reader's language. */
export function postLine(lang: Lang, event: string, actor: string | null | undefined, target: string | null | undefined, title: string | null): string | null {
  const a = nameOr(actor, lang);
  const b = nameOr(target, lang);
  const what = title ?? "";
  if (event === "task_accepted") return lang === "en" ? `${a} will take care of: ${what} (asked by ${b}) 🙌` : `${what}: في إيد ${a} دلوقتي (طلب ${b}) 🙌`;
  if (event === "task_done") return lang === "en" ? `${a} finished: ${what} ✅ Thank you, ${a}!` : `تمّت: ${what} ✅ تسلم الإيد يا ${a}!`;
  if (event === "iftar") {
    // title = "YYYY-MM-DD|note": a calendar day, shown in the reader's language.
    const [day = "", note = ""] = (title ?? "").split("|");
    const when = /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "ar-EG", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`)) : day;
    const extra = note ? ` (${note})` : "";
    return lang === "en" ? `Iftar invitation from ${a}: ${when} 🌙${extra} Who's coming?` : `عزومة فطار من ${a}: ${when} 🌙${extra} مين جاي؟`;
  }
  if (event === "rsvp:yes") return lang === "en" ? `${a}: I'm coming, inshallah ✋` : `${a}: جاي إن شاء الله ✋`;
  if (event === "rsvp:no") return lang === "en" ? `${a}: I can't make it this time 💛` : `${a}: مش هقدر المرة دي 💛`;
  if (event === "zaki_ask") return lang === "en" ? `${a} to Zaki: “${what}”` : `${a} لزكي: «${what}»`;
  if (event === "book_entry") {
    // title = "book name|amount"
    const [book = "", amount = "0"] = (title ?? "").split("|");
    const n = Number(amount).toLocaleString("en-US", { maximumFractionDigits: 2 });
    return lang === "en" ? `${a} added EGP ${n} to “${book}” 🧾` : `${a}: ${n} جنيه في «${book}» 🧾`;
  }
  if (event === "tracker_goal") {
    // title = "kind|custom name|streak"
    const [kind = "custom", name = "", streakText = "0"] = (title ?? "").split("|");
    const label = trackerLabel(TrackerKind.catch("custom").parse(kind), name || null, lang === "en" ? "english" : "arabic");
    const streak = Number(streakText);
    const run = streak >= 2 ? (lang === "en" ? ` ${streak} days in a row 🔥` : ` ${streak} يوم ورا بعض 🔥`) : "";
    return lang === "en" ? `${a} reached today's goal for ${label} 🎯${run}` : `${a}: هدف النهارده في ${label} اتقفل 🎯${run}`;
  }
  if (event.startsWith("checkin:")) {
    const said = CHECKIN_SAID[event.slice(8)]?.[lang];
    // A check-in is the member's own words, passed on: first person, so it fits anyone.
    return said ? `${a}: ${said}${title ? ` (${title})` : ""}` : null;
  }
  return null; // An event this version does not know: skip it rather than show a raw code.
}

/** What a one-tap check-in says, in the member's own voice. */
const CHECKIN_SAID: Record<string, Record<Lang, string>> = {
  arrived: { ar: "وصلت بالسلامة ✅", en: "I've arrived safely ✅" },
  home: { ar: "أنا في البيت 🏡", en: "I'm home 🏡" },
  on_way: { ar: "أنا في الطريق 🚗", en: "I'm on my way 🚗" },
  medicine: { ar: "خدت الدوا 💊", en: "I took my medicine 💊" },
  ok: { ar: "أنا تمام 💛", en: "I'm okay 💛" },
};

/** One member may ask another to check in at most this often. */
export const CHECKIN_ASK_GAP_HOURS = 3;

/** Zaki passes on "let me know you're okay", only because a member asked him to. */
export function checkinAskLine(lang: Lang, name: string | null | undefined, circle: string): string {
  const n = nameOr(name, lang);
  return lang === "en" ? `${n} would love to know you're okay. One tap in «${circle}» is enough 💛` : `طمّن ${n} عليك. دوسة واحدة في «${circle}» كفاية 💛`;
}

/** Homework lines (the child handed it in; the parent approved or asked for a redo). No gendered verbs. */
export function homeworkLine(lang: Lang, kind: "submitted" | "approved" | "redo", name: string | null | undefined, title: string, extra: string | null): string {
  const n = nameOr(name, lang);
  const tail = extra ? `\n«${extra}»` : "";
  if (lang === "en") {
    if (kind === "submitted") return `${n} handed in the homework: ${title} 📚${tail}\nHave a look, then tap Well done or Redo.`;
    if (kind === "approved") return `${n} loved your homework: ${title} 🌟 Well done!`;
    return `${n} asks you to look at this homework again: ${title} ✏️${tail}`;
  }
  if (kind === "submitted") return `الواجب اتسلّم من ${n}: ${title} 📚${tail}\nبص عليه، وبعدين دوس «برافو» أو «يعيده».`;
  if (kind === "approved") return `برافو! ${n} شاف الواجب: ${title} 🌟 شغل حلو!`;
  return `${n} عايز الواجب ده يتراجع تاني: ${title} ✏️${tail}`;
}
