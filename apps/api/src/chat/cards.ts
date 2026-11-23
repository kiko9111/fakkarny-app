import type { ChatAction } from "@fakkarni/shared";
import type { ReplyLang } from "../pipeline/rules";

/**
 * Zaki's action cards, as stored on a reply (messages.actions_json). The wire card is
 * id/kind/status/label/route; `lang` and `payload` stay on the server. `payload` holds the
 * resolved ids of a card waiting for the user's OK, so confirming never re-reads model text.
 */
export interface StoredCard extends ChatAction {
  lang: ReplyLang;
  payload?: PendingPayload;
}

export type PendingPayload =
  | { kind: "log_money"; sectionId: string; amount: number; note: string | null; moneyKind: "expense" | "income" }
  | { kind: "assign_task"; circleId: string; assigneeId: string; title: string; dueAt: string | null; remindAt: string | null; homework: boolean; note: string | null }
  | { kind: "ask_circle"; circleId: string; text: string };

/** Cards for the wire, without the server-only fields. Tolerates anything stored (old rows: null). */
export function wireActions(json: unknown): ChatAction[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((c) => {
    if (!c || typeof c !== "object") return [];
    const card = c as Partial<StoredCard>;
    if (typeof card.id !== "string" || typeof card.kind !== "string" || typeof card.label !== "string" || typeof card.status !== "string") return [];
    return [{ id: card.id, kind: card.kind, status: card.status, label: card.label, route: card.route ?? null }];
  });
}

export const storedCards = (json: unknown): StoredCard[] => (Array.isArray(json) ? (json as StoredCard[]) : []);

/**
 * Fold a name for matching: lower case, no diacritics or tatweel, one alef, ة→ه, ى→ي, no
 * leading "ال" / "el ", no punctuation. "الجيم" matches "جيم", "Gym" matches "gym".
 */
export function foldName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[«»"'“”.,،!?؟()]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !["el", "al", "the"].includes(w))
    .map((w) => w.replace(/^(?:ال|el-|al-)(?=\S{2,})/, ""))
    .join(" ");
}

/**
 * The one thing whose name matches: exact (folded) first, then a name that contains the
 * other. Null when nothing matches or two things match equally (the caller then asks).
 */
export function matchByName<T>(list: T[], name: string | undefined, nameOf: (t: T) => (string | null | undefined)[]): T | null {
  if (!name) return null;
  const want = foldName(name);
  if (!want) return null;
  const names = (t: T) => nameOf(t).filter((n): n is string => Boolean(n)).map(foldName).filter(Boolean);
  const exact = list.filter((t) => names(t).includes(want));
  if (exact.length === 1) return exact[0]!;
  if (exact.length > 1) return null;
  const partial = list.filter((t) => names(t).some((n) => n.includes(want) || want.includes(n)));
  return partial.length === 1 ? partial[0]! : null;
}

const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const egp = (lang: ReplyLang, n: number) => (lang === "english" ? `EGP ${num(n)}` : `${num(n)} جنيه`);
const q = (s: string) => `«${s}»`;

/** Card wording. Short, one line, no gendered verbs about other people in Arabic. */
export const LABEL = {
  moneyLogged: (l: ReplyLang, kind: "expense" | "income", amount: number, section: string, monthTotal: number) =>
    l === "english"
      ? `${kind === "income" ? "Income" : "Spent"} ${egp(l, amount)} in ${q(section)} · this month ${egp(l, monthTotal)}`
      : `${kind === "income" ? "دخل" : "مصروف"} ${egp(l, amount)} في ${q(section)} · الشهر ده ${egp(l, monthTotal)}`,
  moneyAsk: (l: ReplyLang, amount: number, book: string, circle: string | null) =>
    l === "english"
      ? `Add ${egp(l, amount)} to the shared book ${q(book)}${circle ? ` (${circle})` : ""}? Everyone in it will see it.`
      : `أضيف ${egp(l, amount)} في الدفتر المشترك ${q(book)}${circle ? ` (${circle})` : ""}؟ كل اللي فيه هيشوفوها.`,
  sectionMade: (l: ReplyLang, name: string, budget: number | null, circle: string | null) =>
    l === "english"
      ? `New ${circle ? `shared book with ${circle}` : "section"} ${q(name)}${budget ? ` · budget ${egp(l, budget)} a month` : ""}`
      : `${circle ? `دفتر مشترك مع ${circle}` : "قسم جديد"} ${q(name)}${budget ? ` · ميزانية ${egp(l, budget)} في الشهر` : ""}`,
  sectionExists: (l: ReplyLang, name: string) => (l === "english" ? `${q(name)} is already there` : `${q(name)} موجود أصلاً`),
  budgetSet: (l: ReplyLang, name: string, budget: number | null) =>
    l === "english"
      ? budget ? `Budget for ${q(name)}: ${egp(l, budget)} a month` : `No budget for ${q(name)} any more`
      : budget ? `ميزانية ${q(name)}: ${egp(l, budget)} في الشهر` : `شلت ميزانية ${q(name)}`,
  trackerMade: (l: ReplyLang, label: string, askTimes: string[], circle: string | null) =>
    l === "english"
      ? `Tracking ${label}${askTimes.length ? ` · I'll ask at ${askTimes.join(", ")}` : ""}${circle ? ` · shared with ${circle}` : ""}`
      : `بنتابع ${label}${askTimes.length ? ` · هسألك الساعة ${askTimes.join("، ")}` : ""}${circle ? ` · مع ${circle}` : ""}`,
  trackerExists: (l: ReplyLang, label: string) => (l === "english" ? `You already track ${label}` : `إنت بتتابع ${label} أصلاً`),
  trackerLogged: (l: ReplyLang, label: string, today: number, goal: number | null) =>
    l === "english" ? `${label}: ${num(today)}${goal ? ` of ${num(goal)}` : ""} today` : `${label}: ${num(today)}${goal ? ` من ${num(goal)}` : ""} النهارده`,
  trackerUpdated: (l: ReplyLang, label: string, askTimes: string[] | null, goal: number | null) =>
    l === "english"
      ? `${label}: ${[askTimes ? (askTimes.length ? `I'll ask at ${askTimes.join(", ")}` : "no set times") : null, goal ? `goal ${num(goal)}` : null].filter(Boolean).join(" · ")}`
      : `${label}: ${[askTimes ? (askTimes.length ? `هسألك الساعة ${askTimes.join("، ")}` : "من غير مواعيد") : null, goal ? `الهدف ${num(goal)}` : null].filter(Boolean).join(" · ")}`,
  trackerLimit: (l: ReplyLang) => (l === "english" ? "The free plan keeps one tracker. Zaki Pro has no limit." : "الخطة المجانية فيها متابعة واحدة. زكي برو من غير حد."),
  circleMade: (l: ReplyLang, name: string) => (l === "english" ? `New circle ${q(name)} · tap to invite people` : `دايرة جديدة ${q(name)} · دوس عشان تعزم الناس`),
  circleExists: (l: ReplyLang, name: string) => (l === "english" ? `You're already in ${q(name)}` : `إنت في ${q(name)} أصلاً`),
  taskAsk: (l: ReplyLang, person: string, title: string, circle: string) =>
    l === "english" ? `Ask ${person} (${circle}): ${q(title)}?` : `أطلب من ${person} (${circle}): ${q(title)}؟`,
  taskSent: (l: ReplyLang, person: string, title: string) =>
    l === "english" ? `Sent to ${person}: ${q(title)}. It's theirs once they say yes.` : `اتبعتت لـ ${person}: ${q(title)}. هتتسجل أول ما الموافقة توصل.`,
  circleAsk: (l: ReplyLang, circle: string, text: string) => (l === "english" ? `Post in ${q(circle)}: “${text}”?` : `أنزلها في ${q(circle)}: «${text}»؟`),
  circlePosted: (l: ReplyLang, circle: string) => (l === "english" ? `Posted in ${q(circle)}` : `نزلت في ${q(circle)}`),
  cancelled: (l: ReplyLang) => (l === "english" ? "Cancelled" : "اتلغت"),
  notFound: (l: ReplyLang, what: "section" | "tracker" | "circle" | "person" | "which_circle", name?: string) => {
    const n = name ? q(name) : "";
    if (l === "english") {
      return { section: `I couldn't find the section ${n}`, tracker: `I couldn't find the tracker ${n}`, circle: `I couldn't find the circle ${n}`, person: `I couldn't find ${n} in your circles`, which_circle: "Which circle? Say its name" }[what];
    }
    return { section: `مالقيتش قسم ${n}`, tracker: `مالقيتش متابعة ${n}`, circle: `مالقيتش دايرة ${n}`, person: `مالقيتش ${n} في الدواير بتاعتك`, which_circle: "أنهي دايرة؟ قولي اسمها" }[what];
  },
  ownerOnly: (l: ReplyLang, name: string) => (l === "english" ? `Only the owner of ${q(name)} can change its budget` : `صاحب ${q(name)} بس اللي يغير ميزانيته`),
  tooMany: (l: ReplyLang) => (l === "english" ? "That's the most this allows for now" : "ده أقصى عدد دلوقتي"),
  failed: (l: ReplyLang) => (l === "english" ? "That didn't work, try again from the app" : "ماظبطتش، جرّب من التطبيق"),
};

/** One-line chat answer when the user says "yes" to a waiting card. */
export const CONFIRMED_REPLY: Record<ReplyLang, string> = { arabic: "تمام، عملتها ✅", english: "Done ✅" };

const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

const CONFIRM = new Set([
  "اه", "آه", "أه", "ايوه", "أيوه", "ايوة", "أيوة", "اكيد", "أكيد", "تمام", "ماشي", "اوك", "اوكي", "ابعت", "ابعتها", "ابعته", "ابعتهالها", "ابعتهاله", "انزل", "نزلها",
  "اعمل", "اعملها", "يلا", "يالا", "موافق", "تم", "اه يا", "يا", "زكي", "اوي", "بالظبط", "صح",
  "yes", "yeah", "yep", "yup", "ok", "okay", "sure", "send", "it", "go", "ahead", "do", "please", "yalla", "aywa", "aiwa", "ah", "tamam", "mashy", "mashi", "ebaat", "eb3at", "eb3atha", "zaki",
]);
const CONFIRM_CORE = new Set([...CONFIRM].filter((w) => !["يا", "زكي", "اوي", "it", "please", "zaki", "ahead", "do"].includes(w)));
const CANCEL = new Set(["لا", "لأ", "لاء", "بلاش", "الغي", "الغيها", "لغيها", "خلاص", "سيبك", "مش", "دلوقتي", "no", "nope", "cancel", "dont", "don", "t", "la", "la2", "balash", "not", "now", "never", "mind", "يا", "زكي", "zaki"]);
const CANCEL_CORE = new Set(["لا", "لأ", "لاء", "بلاش", "الغي", "الغيها", "لغيها", "سيبك", "no", "nope", "cancel", "la", "la2", "balash"]);

/** A short plain yes to a waiting card: "اه ابعتها", "yes send it", "yalla". */
export function isConfirm(text: string): boolean {
  const w = words(text);
  return w.length > 0 && w.length <= 5 && w.every((x) => CONFIRM.has(x)) && w.some((x) => CONFIRM_CORE.has(x));
}

/** A short plain no: "لا بلاش", "cancel", "la2". */
export function isCancel(text: string): boolean {
  const w = words(text);
  return w.length > 0 && w.length <= 5 && w.every((x) => CANCEL.has(x)) && w.some((x) => CANCEL_CORE.has(x));
}

export const CANCELLED_REPLY: Record<ReplyLang, string> = { arabic: "تمام، لغيتها.", english: "Okay, cancelled." };
