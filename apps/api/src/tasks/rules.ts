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
  return null; // An event this version does not know: skip it rather than show a raw code.
}
