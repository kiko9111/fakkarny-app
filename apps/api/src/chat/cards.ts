import { randomUUID } from "node:crypto";
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
  /** A done card the user can take back ("Undo"): what to do to undo it. Server-only. */
  undo?: UndoPayload;
  /** Cards on someone else's news (a request, handed-in homework): "No" does this instead of just cancelling. */
  noPayload?: PendingPayload;
}

/**
 * A card on a chat line about what someone else did ("Mona asked you to buy bread"), so the
 * reader answers right there: the button or a plain yes runs `payload`, a no runs `noPayload`.
 */
export function activityCard(lang: ReplyLang, kind: ChatAction["kind"], label: string, route: string | null, payload: PendingPayload, noPayload?: PendingPayload): StoredCard {
  return { id: randomUUID(), kind, status: "pending", label, route, lang, payload, ...(noPayload ? { noPayload } : {}) };
}

export type PendingPayload =
  | { kind: "log_money"; sectionId: string; amount: number; note: string | null; moneyKind: "expense" | "income" }
  | { kind: "assign_task"; circleId: string; assigneeId: string; title: string; dueAt: string | null; remindAt: string | null; homework: boolean; note: string | null; reward?: number | null }
  | { kind: "ask_circle"; circleId: string; text: string }
  | { kind: "delete_section"; sectionId: string }
  | { kind: "delete_tracker"; trackerId: string }
  | { kind: "daftar_add"; otherName: string; direction: "owed_to_me" | "i_owe"; amount: number; note: string | null; circleId: string | null; otherUserId: string | null }
  | { kind: "daftar_settle" | "daftar_cancel"; entryId: string }
  | { kind: "daftar_answer"; entryId: string; answer: "confirm" | "dispute" }
  | { kind: "task_answer"; taskId: string; answer: "accept" | "decline" }
  | { kind: "task_nudge" | "task_cancel"; taskId: string }
  | { kind: "homework_submit"; taskId: string; text: string }
  | { kind: "homework_review"; taskId: string; verdict: "approved" | "redo"; note: string | null }
  | { kind: "checkin"; circleId: string; checkinKind: "arrived" | "home" | "on_way" | "medicine" | "ok"; note: string | null }
  | { kind: "ask_checkin"; circleId: string; userId: string }
  | { kind: "leave_circle"; circleId: string }
  | { kind: "iftar"; circleId: string; on: string; note: string | null }
  | { kind: "split_circle"; circleId: string; amount: number; title: string }
  | { kind: "split_i_paid"; splitId: string };

/** How to take back a done card. Only the user's own things; nothing that reached other people. */
export type UndoPayload =
  | { kind: "money_entry"; entryId: string }
  | { kind: "money_entry_restore"; sectionId: string; amount: number; note: string | null; split: string[]; source: string; at: string }
  | { kind: "section"; sectionId: string }
  | { kind: "budget"; sectionId: string; budget: number | null }
  | { kind: "tracker"; trackerId: string }
  | { kind: "tracker_entry"; entryId: string }
  | { kind: "tracker_entry_restore"; trackerId: string; amount: number; source: string; at: string }
  | { kind: "tracker_settings"; trackerId: string; goal: number | null; askTimes: string[] }
  | { kind: "circle"; circleId: string }
  | { kind: "rename"; circleId: string; name: string }
  | { kind: "memories"; memories: { kind: string; subject: string; content: string; createdAt: string }[] }
  | { kind: "user"; data: { name?: string | null; wakeTime?: string; sleepTime?: string; instapayLink?: string | null; gender?: string | null; tone?: string; checkinIntervalH?: string } }
  | { kind: "split"; splitId: string }
  | { kind: "split_paid"; splitId: string; index: number }
  | { kind: "daftar_entry"; entryId: string }
  | { kind: "task_remind"; taskId: string; remindAt: string | null }
  | { kind: "item_status"; itemId: string; status: "open" };

/** Cards for the wire, without the server-only fields. Tolerates anything stored (old rows: null). */
export function wireActions(json: unknown): ChatAction[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((c) => {
    if (!c || typeof c !== "object") return [];
    const card = c as Partial<StoredCard>;
    if (typeof card.id !== "string" || typeof card.kind !== "string" || typeof card.label !== "string" || typeof card.status !== "string") return [];
    return [{ id: card.id, kind: card.kind, status: card.status, label: card.label, route: card.route ?? null, ...(card.status === "done" && card.undo ? { undoable: true } : {}) }];
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
  undone: (l: ReplyLang) => (l === "english" ? "Undone" : "رجّعتها"),
  entryDeleted: (l: ReplyLang, amount: number, section: string) => (l === "english" ? `Deleted ${egp(l, amount)} from ${q(section)}` : `مسحت ${egp(l, amount)} من ${q(section)}`),
  noEntry: (l: ReplyLang) => (l === "english" ? "I couldn't find that entry" : "مالقيتش المصروف ده"),
  sectionDeleteAsk: (l: ReplyLang, name: string, entries: number) =>
    l === "english" ? `Delete ${q(name)}${entries ? ` and its ${entries} entries` : ""}?` : `أمسح ${q(name)}${entries ? ` وفيه ${entries} مصروف` : ""}؟`,
  sectionDeleted: (l: ReplyLang, name: string) => (l === "english" ? `Deleted ${q(name)}` : `مسحت ${q(name)}`),
  daftarAsk: (l: ReplyLang, person: string, amount: number, dir: "owed_to_me" | "i_owe", member: boolean) =>
    l === "english"
      ? `Add to the Daftar: ${dir === "owed_to_me" ? `${person} owes you` : `you owe ${person}`} ${egp(l, amount)}?${member ? " They'll see it and confirm." : ""}`
      : `أسجلها في الدفتر: ${dir === "owed_to_me" ? `ليك عند ${person}` : `عليك لـ ${person}`} ${egp(l, amount)}؟${member ? " هتوصله ويأكدها." : ""}`,
  daftarMade: (l: ReplyLang, person: string, amount: number, dir: "owed_to_me" | "i_owe", member: boolean) =>
    l === "english"
      ? `In the Daftar: ${dir === "owed_to_me" ? `${person} owes you` : `you owe ${person}`} ${egp(l, amount)} · ${member ? "sent for them to confirm" : "tap to send the confirm link"}`
      : `في الدفتر: ${dir === "owed_to_me" ? `ليك عند ${person}` : `عليك لـ ${person}`} ${egp(l, amount)} · ${member ? "اتبعتت يأكدها" : "دوس وابعتله لينك التأكيد"}`,
  daftarSettleAsk: (l: ReplyLang, person: string, amount: number) => (l === "english" ? `Mark ${egp(l, amount)} with ${person} as paid? They'll be told.` : `أعلّم إن الـ${egp(l, amount)} مع ${person} اتدفعت؟ هيوصله خبر.`),
  daftarSettled: (l: ReplyLang, person: string, amount: number) => (l === "english" ? `Paid: ${egp(l, amount)} with ${person}` : `اتدفعت: ${egp(l, amount)} مع ${person}`),
  daftarCancelAsk: (l: ReplyLang, person: string, amount: number) => (l === "english" ? `Cancel the entry of ${egp(l, amount)} with ${person}?` : `ألغي تسجيلة الـ${egp(l, amount)} مع ${person}؟`),
  daftarCancelled: (l: ReplyLang, person: string) => (l === "english" ? `Cancelled the entry with ${person}` : `لغيت التسجيلة مع ${person}`),
  daftarAnswerAsk: (l: ReplyLang, person: string, amount: number, yes: boolean) =>
    l === "english" ? `Tell ${person} the ${egp(l, amount)} is ${yes ? "right" : "not right"}?` : `أقول لـ ${person} إن الـ${egp(l, amount)} ${yes ? "مظبوطة" : "مش مظبوطة"}؟`,
  daftarAnswered: (l: ReplyLang, person: string, yes: boolean) => (l === "english" ? `Told ${person}: ${yes ? "it's right" : "not right"}` : `قلت لـ ${person}: ${yes ? "مظبوطة" : "مش مظبوطة"}`),
  daftarRemind: (l: ReplyLang, person: string) => (l === "english" ? `Tap to send ${person} a gentle reminder from your WhatsApp` : `دوس وابعت لـ ${person} تفكير لطيف من الواتساب بتاعك`),
  daftarNotYet: (l: ReplyLang) => (l === "english" ? "Zaki reminds only after they confirmed it" : "زكي بيفكّر بس بعد ما يأكدها"),
  notAllowed: (l: ReplyLang) => (l === "english" ? "That can't be done on it now" : "مينفعش دلوقتي"),
  trackerUndone: (l: ReplyLang, label: string) => (l === "english" ? `Took back the last log of ${label}` : `شلت آخر تسجيل في ${label}`),
  trackerNothing: (l: ReplyLang, label: string) => (l === "english" ? `Nothing logged today in ${label}` : `مفيش تسجيل النهارده في ${label}`),
  trackerDeleteAsk: (l: ReplyLang, label: string) => (l === "english" ? `Stop and delete ${label} with its history?` : `أوقف ${label} وأمسح تاريخها؟`),
  trackerDeleted: (l: ReplyLang, label: string) => (l === "english" ? `Deleted ${label}` : `مسحت ${label}`),
  ramadanPack: (l: ReplyLang, n: number) => (l === "english" ? `Ramadan pack added · ${n} trackers` : `باقة رمضان اتضافت · ${n} متابعات`),
  notRamadan: (l: ReplyLang) => (l === "english" ? "The Ramadan pack opens in Ramadan" : "باقة رمضان بتفتح في رمضان"),
  invite: (l: ReplyLang, circle: string) => (l === "english" ? `Tap to send the ${q(circle)} invite from your WhatsApp` : `دوس وابعت دعوة ${q(circle)} من الواتساب بتاعك`),
  joined: (l: ReplyLang, circle: string) => (l === "english" ? `You joined ${q(circle)}` : `دخلت ${q(circle)}`),
  badCode: (l: ReplyLang) => (l === "english" ? "That invite code doesn't work" : "كود الدعوة ده مش شغال"),
  renamed: (l: ReplyLang, from: string, to: string) => (l === "english" ? `${q(from)} is now ${q(to)}` : `${q(from)} بقت ${q(to)}`),
  ownerOnlyCircle: (l: ReplyLang, name: string) => (l === "english" ? `Only the owner of ${q(name)} can do that` : `صاحب ${q(name)} بس اللي يعمل كده`),
  leaveAsk: (l: ReplyLang, name: string) => (l === "english" ? `Leave ${q(name)}?` : `تخرج من ${q(name)}؟`),
  left: (l: ReplyLang, name: string) => (l === "english" ? `You left ${q(name)}` : `خرجت من ${q(name)}`),
  checkinAsk: (l: ReplyLang, circle: string, what: string) => (l === "english" ? `Tell ${q(circle)}: ${what}?` : `أقول لـ ${q(circle)}: ${what}؟`),
  checkinSent: (l: ReplyLang, circle: string, what: string) => (l === "english" ? `Told ${q(circle)}: ${what}` : `قلت لـ ${q(circle)}: ${what}`),
  askCheckinAsk: (l: ReplyLang, person: string) => (l === "english" ? `Ask ${person} to check in?` : `أطلب من ${person} يطمّنك؟`),
  askCheckinSent: (l: ReplyLang, person: string) => (l === "english" ? `Asked ${person} to check in` : `طلبت من ${person} يطمّنك`),
  tooSoon: (l: ReplyLang) => (l === "english" ? "Already asked a little while ago" : "اتطلبت من شوية"),
  iftarAsk: (l: ReplyLang, circle: string, on: string) => (l === "english" ? `Invite ${q(circle)} to iftar on ${on}?` : `أعزم ${q(circle)} على الفطار يوم ${on}؟`),
  iftarSent: (l: ReplyLang, circle: string) => (l === "english" ? `Iftar invite posted in ${q(circle)}` : `دعوة الفطار نزلت في ${q(circle)}`),
  /** On a request someone sent: Yes accepts, No declines. */
  taskRequestCard: (l: ReplyLang, title: string) => (l === "english" ? `Take on ${q(title)}? Yes / No` : `توافق على ${q(title)}؟ أيوه / لأ`),
  /** On handed-in homework: Yes = well done, No = redo. */
  homeworkCard: (l: ReplyLang, person: string) => (l === "english" ? `Tell ${person} "well done" 👏? (No = do it again)` : `أقول لـ ${person} «برافو» 👏؟ (لأ = يعيدها)`),
  /** On a Daftar entry a circle member recorded: Yes = right, No = not right. */
  daftarCard: (l: ReplyLang, amount: number) => (l === "english" ? `Is the ${egp(l, amount)} right? Yes / No` : `الـ${egp(l, amount)} مظبوطة؟ أيوه / لأ`),
  taskAnswerAsk: (l: ReplyLang, person: string, title: string, yes: boolean) =>
    l === "english" ? `${yes ? "Say yes" : "Say no"} to ${person}: ${q(title)}?` : `${yes ? "أوافق" : "أعتذر"} لـ ${person} على ${q(title)}؟`,
  taskAnswered: (l: ReplyLang, title: string, yes: boolean) => (l === "english" ? (yes ? `Yours now: ${q(title)}` : `Said no to ${q(title)}`) : yes ? `بقت عليك: ${q(title)}` : `اعتذرت عن ${q(title)}`),
  nudgeAsk: (l: ReplyLang, person: string, title: string) => (l === "english" ? `Remind ${person} about ${q(title)}?` : `أفكّر ${person} بـ ${q(title)}؟`),
  nudged: (l: ReplyLang, person: string) => (l === "english" ? `Reminded ${person}` : `فكّرت ${person}`),
  taskCancelAsk: (l: ReplyLang, person: string, title: string) => (l === "english" ? `Cancel ${q(title)} for ${person}?` : `ألغي ${q(title)} من على ${person}؟`),
  taskCancelled: (l: ReplyLang, title: string) => (l === "english" ? `Cancelled ${q(title)}` : `اتلغت ${q(title)}`),
  taskRemind: (l: ReplyLang, title: string, at: string | null) => (l === "english" ? `${q(title)}: ${at ? `reminder at ${at}` : "no set reminder"}` : `${q(title)}: ${at ? `التفكير ${at}` : "من غير ميعاد تفكير"}`),
  submitAsk: (l: ReplyLang, person: string, title: string) => (l === "english" ? `Hand in ${q(title)} to ${person}?` : `أسلّم ${q(title)} لـ ${person}؟`),
  submitted: (l: ReplyLang, title: string) => (l === "english" ? `Handed in ${q(title)}` : `اتسلّم ${q(title)}`),
  reviewAsk: (l: ReplyLang, person: string, title: string, ok: boolean) =>
    l === "english" ? `Tell ${person} ${ok ? "well done" : "to redo"} ${q(title)}?` : `أقول لـ ${person} ${ok ? "برافو على" : "يعيد"} ${q(title)}؟`,
  reviewed: (l: ReplyLang, person: string, ok: boolean) => (l === "english" ? `Told ${person}: ${ok ? "well done" : "redo"}` : `قلت لـ ${person}: ${ok ? "برافو" : "يعيدها"}`),
  noTask: (l: ReplyLang) => (l === "english" ? "I couldn't find that task" : "مالقيتش المهمة دي"),
  noDaftar: (l: ReplyLang, person?: string) =>
    person ? (l === "english" ? `Nothing open with ${person} in the Daftar or your debts` : `مفيش حاجة مفتوحة مع ${person} في الدفتر ولا في الديون`) : l === "english" ? "I couldn't find that in the Daftar" : "مالقيتهاش في الدفتر",
  debtClosed: (l: ReplyLang, person: string, cancelled: boolean) =>
    l === "english" ? `${cancelled ? "Removed" : "Marked paid"}: the debt with ${person}` : `${cancelled ? "اتشال" : "اتسدّد"} الدين مع ${person}`,
  splitMade: (l: ReplyLang, total: number, people: number, share: number) =>
    l === "english" ? `Split ${egp(l, total)} between ${people} · about ${egp(l, share)} each · tap to send the link` : `اتقسم ${egp(l, total)} على ${people} · حوالي ${egp(l, share)} للفرد · دوس وابعت اللينك`,
  splitPaid: (l: ReplyLang, person: string) => (l === "english" ? `${person} paid their share` : `${person} دفع نصيبه`),
  splitCircleAsk: (l: ReplyLang, total: number, circle: string, people: number) =>
    l === "english" ? `Split ${egp(l, total)} in ${circle} between ${people}, and tell each one their share?` : `أقسم ${egp(l, total)} في ${circle} على ${people}، وأقول لكل واحد نصيبه؟`,
  splitIPaid: (l: ReplyLang) => (l === "english" ? "Marked your share as paid ✓" : "اتسجّل إنك دفعت نصيبك ✓"),
  noSplit: (l: ReplyLang) => (l === "english" ? "I couldn't find that split" : "مالقيتش القسمة دي"),
  forgot: (l: ReplyLang, n: number) => (l === "english" ? `Forgot ${n} thing${n === 1 ? "" : "s"}` : n === 1 ? "نسيت الحاجة دي" : `نسيت ${n} حاجات`),
  nothingToForget: (l: ReplyLang) => (l === "english" ? "I don't have that saved" : "مش محفوظة عندي أصلاً"),
  setting: (l: ReplyLang, what: string) => (l === "english" ? `Settings: ${what}` : `الإعدادات: ${what}`),
  badSetting: (l: ReplyLang) => (l === "english" ? "That value doesn't fit, try it in Settings" : "القيمة دي مش مظبوطة، جرّب من الإعدادات"),
  open: (l: ReplyLang, screen: string) => (l === "english" ? `Open ${screen}` : `افتح ${screen}`),
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
  "اعمل", "اعملها", "يلا", "يالا", "موافق", "تم", "حاضر", "هجيبه", "هجيبها", "هعمله", "هعملها", "هجيبهم", "من", "عيني", "عنيا", "7ader", "hagebo", "hagebha", "ha3melo", "ha3melha", "will", "i'll", "ill", "on", "got", "اه يا", "يا", "زكي", "اوي", "بالظبط", "صح",
  "yes", "yeah", "yep", "yup", "ok", "okay", "sure", "send", "it", "go", "ahead", "do", "please", "yalla", "aywa", "aiwa", "ah", "tamam", "mashy", "mashi", "ebaat", "eb3at", "eb3atha", "zaki",
]);
const CONFIRM_CORE = new Set([...CONFIRM].filter((w) => !["يا", "زكي", "اوي", "it", "please", "zaki", "ahead", "do", "من", "will", "i'll", "ill", "on", "got"].includes(w)));
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

const UNDO = new Set(["تراجع", "رجع", "رجعها", "رجعه", "الغي", "الغيها", "امسح", "امسحها", "اللي", "فات", "عملته", "دي", "ده", "يا", "زكي", "undo", "that", "it", "take", "back", "zaki", "please", "last", "one"]);
const UNDO_CORE = new Set(["تراجع", "رجعها", "رجعه", "امسحها", "undo", "back"]);

/** A short "take that back": "تراجع", "رجّعها", "undo that". Undoes Zaki's latest change of the user's own. */
export function isUndo(text: string): boolean {
  const w = words(text);
  return w.length > 0 && w.length <= 5 && w.every((x) => UNDO.has(x)) && w.some((x) => UNDO_CORE.has(x));
}

/**
 * "I'm home" said to Zaki: offer to tell the family (a card, so nothing reaches them without a
 * yes). Strict on purpose: "وصلت" alone ("did it arrive?") is not a check-in.
 */
export function homeCheckin(text: string): "home" | "arrived" | null {
  const t = text.toLowerCase().replace(/[ً-ْـ]/g, "").replace(/[إأآ]/g, "ا").replace(/[!.,؟?🌟❤️💛✅🏠]+/gu, " ").trim();
  if (t.length > 40) return null;
  if (/^(انا\s+)?(وصلت\s+(البيت|بيتي)|روحت(\s+البيت)?|انا\s+في\s+البيت|في\s+البيت\s+خلاص)(\s+(خلاص|الحمد\s*لله|يا\s+زكي))*$/.test(t)) return "home";
  if (/^(i'?m|i\s+am)\s+(home|back\s+home)(\s+now)?$|^(got|back)\s+home(\s+safe(ly)?)?$|^home\s+safe$/.test(t)) return "home";
  if (/^(انا\s+)?وصلت\s+بالسلامة(\s+الحمد\s*لله)?$|^(arrived|got\s+there)\s+safe(ly)?$|^i\s+arrived(\s+safe(ly)?)?$/.test(t)) return "arrived";
  return null;
}

export const HOME_REPLY: Record<ReplyLang, string> = { arabic: "حمد الله على السلامة 🌟", english: "Glad you're back safe 🌟" };
