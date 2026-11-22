import type { DaftarStatus } from "@fakkarni/shared";

/**
 * Shared Daftar wording and state rules (pure). Money talk stays friendly and face-saving
 * for both sides (Zaki's character), and Zaki only records: it never holds or moves money.
 */
export type Lang = "ar" | "en";
export type Direction = "owed_to_me" | "i_owe";

/** Flip the creator's direction to the other person's point of view. */
export const flip = (d: Direction): Direction => (d === "owed_to_me" ? "i_owe" : "owed_to_me");

export function formatAmount(amount: number, currency: string, lang: Lang): string {
  const n = amount.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (currency !== "EGP") return `${n} ${currency}`;
  return lang === "ar" ? `${n} جنيه` : `EGP ${n}`;
}

/** What may happen next. `who` is the caller: the creator or the other person. */
export function canRespond(status: DaftarStatus, who: "creator" | "other"): boolean {
  return who === "other" && status === "pending";
}
export const canSettle = (status: DaftarStatus) => status === "pending" || status === "confirmed";
export const canCancel = (status: DaftarStatus, who: "creator" | "other") => who === "creator" && (status === "pending" || status === "disputed");
/** A nudge goes out only once the other person has agreed the debt is real. */
export const canNudge = (status: DaftarStatus, who: "creator" | "other", creatorDirection: Direction) =>
  who === "creator" && status === "confirmed" && creatorDirection === "owed_to_me";

interface TextInput {
  lang: Lang;
  direction: Direction;
  amount: number;
  currency: string;
  note: string | null;
  url: string;
}

/** The first WhatsApp message: asks the other person to confirm the entry. */
export function confirmShareText(i: TextInput): string {
  const money = formatAmount(i.amount, i.currency, i.lang);
  if (i.lang === "en") {
    const what = i.direction === "owed_to_me" ? `the ${money} between us` : `the ${money} I owe you`;
    return `Hi 🌟 I noted ${what}${i.note ? ` (${i.note})` : ""} on Zaki so neither of us has to remember. Can you confirm it's right?\n${i.url}`;
  }
  const what = i.direction === "owed_to_me" ? `الـ${money} اللي بينا` : `الـ${money} اللي ليك عندي`;
  return `أهلاً 🌟 سجّلت ${what}${i.note ? ` (${i.note})` : ""} على زكي عشان محدش فينا ينسى. ممكن تأكّد إنها مظبوطة؟\n${i.url}`;
}

/** A kind reminder for a confirmed debt, sent by the creator from their own number. */
export function nudgeShareText(i: TextInput): string {
  const money = formatAmount(i.amount, i.currency, i.lang);
  if (i.lang === "en") return `Hi 🌟 just a gentle reminder from Zaki about the ${money}${i.note ? ` (${i.note})` : ""}. Whenever it suits you, no rush.\n${i.url}`;
  return `أهلاً 🌟 زكي بيفكّرنا بس بالـ${money}${i.note ? ` (${i.note})` : ""}. وقت ما يناسبك، من غير أي ضغط.\n${i.url}`;
}

/** Zaki's line in the creator's chat when the other person answers or settles. */
export function updateLine(lang: Lang, event: "confirmed" | "disputed" | "settled", otherName: string, amount: number, currency: string): string {
  const money = formatAmount(amount, currency, lang);
  if (lang === "en") {
    if (event === "confirmed") return `${otherName} confirmed the ${money} ✅ It's in the Daftar for both of you.`;
    if (event === "settled") return `The ${money} with ${otherName} is settled 🎉 One less thing to carry.`;
    return `${otherName} says the ${money} doesn't look right. Worth a quick, friendly word to sort it out.`;
  }
  if (event === "confirmed") return `${otherName} أكّد الـ${money} ✅ اتسجلت في الدفتر عندكم انتو الاتنين.`;
  if (event === "settled") return `الـ${money} اللي مع ${otherName} اتقفلت 🎉 حاجة أقل تشيل همّها.`;
  return `${otherName} شايف إن الـ${money} مش مظبوطة. كلمة حلوة بينكم وتتظبط.`;
}
