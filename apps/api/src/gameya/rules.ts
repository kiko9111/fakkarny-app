import { roundState, type Gameya } from "@fakkarni/shared";
import { formatAmount, type Lang } from "../daftar/rules";

/**
 * Words for the gam'eya book, per reader language. Template words only, no AI call. Arabic lines
 * about another person avoid gendered verbs (the reader may be anyone), as the circle lines do.
 */

const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2027-02" → "فبراير 2027" / "February 2027". */
export function monthName(month: string, lang: Lang): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return `${(lang === "en" ? EN_MONTHS : AR_MONTHS)[m - 1]} ${y}`;
}

const q = (s: string) => `«${s}»`;
const money = (g: Pick<Gameya, "currency">, n: number, lang: Lang) => formatAmount(n, g.currency, lang);
const who = (lang: Lang, name: string | null | undefined) => name || (lang === "en" ? "Someone" : "حد");

/** To a Zaki member, when the organizer adds them. */
export function joinedLine(lang: Lang, g: Pick<Gameya, "name" | "amount" | "currency" | "months" | "pot">, owner: string | null, turn: number, month: string): string {
  return lang === "en"
    ? `🤝 ${who(lang, owner)} added you to the gam'eya ${q(g.name)}: ${money(g, g.amount, lang)} a month for ${g.months} months. Your turn is #${turn}, in ${monthName(month, lang)} (${money(g, g.pot, lang)}).`
    : `🤝 «${g.name}»: اتضفت في جمعية من ${who(lang, owner)}، ${money(g, g.amount, lang)} في الشهر لمدة ${g.months} شهور. دورك رقم ${turn}، في ${monthName(month, lang)} (${money(g, g.pot, lang)}).`;
}

/** To the organizer, when a member (app or web page) says they paid. */
export function memberPaidLine(lang: Lang, g: Pick<Gameya, "name" | "amount" | "currency">, name: string, month: string, web: boolean, paidCount: number, total: number): string {
  return lang === "en"
    ? `💰 ${name} paid ${money(g, g.amount, lang)} for ${monthName(month, lang)} in ${q(g.name)}${web ? " (on the link)" : ""}. ${paidCount} of ${total} paid.`
    : `💰 «${g.name}»: قسط ${monthName(month, lang)} اتدفع من ${name}${web ? " (من اللينك)" : ""}، ${money(g, g.amount, lang)}. دفع ${paidCount} من ${total}.`;
}

/** To a Zaki member, when the organizer ticks their payment. */
export function ownerTickedLine(lang: Lang, g: Pick<Gameya, "name">, month: string): string {
  return lang === "en" ? `✅ Your ${monthName(month, lang)} payment in ${q(g.name)} is recorded.` : `✅ «${g.name}»: قسط ${monthName(month, lang)} بتاعك اتسجّل إنه وصل.`;
}

/** To the organizer, once everyone paid a round. */
export function allPaidLine(lang: Lang, g: Pick<Gameya, "name" | "pot" | "currency">, month: string, receiver: string | null): string {
  return lang === "en"
    ? `🎉 Everyone paid ${monthName(month, lang)} in ${q(g.name)}. ${receiver ? `Hand ${receiver} the pot: ${money(g, g.pot, lang)}.` : ""}`.trim()
    : `🎉 «${g.name}»: الكل دفع قسط ${monthName(month, lang)}. ${receiver ? `سلّم ${receiver} القبض: ${money(g, g.pot, lang)}.` : ""}`.trim();
}

/** To the receiver (when the organizer marks it) or the organizer (when the receiver does). */
export function receivedLine(lang: Lang, g: Pick<Gameya, "name" | "pot" | "currency">, month: string, toReceiver: boolean, name: string): string {
  if (toReceiver)
    return lang === "en"
      ? `🎉 Your pot from ${q(g.name)} (${monthName(month, lang)}) is marked handed over: ${money(g, g.pot, lang)}. Mabrook!`
      : `🎉 «${g.name}»: قبض ${monthName(month, lang)} اتسجّل إنه وصلك، ${money(g, g.pot, lang)}. مبروك!`;
  return lang === "en"
    ? `✅ ${name} says the ${monthName(month, lang)} pot of ${q(g.name)} arrived.`
    : `✅ «${g.name}»: قبض ${monthName(month, lang)} وصل لـ ${name}، حسب كلامه في زكي.`;
}

/** The day before pay day, to a Zaki member who hasn't paid. */
export function dueLine(lang: Lang, g: Pick<Gameya, "name" | "amount" | "currency">, month: string, receiver: string | null, receiverIsMe: boolean): string {
  const turn = receiverIsMe
    ? lang === "en" ? " This month's pot is yours 🎉" : " القبض الشهر ده ليك 🎉"
    : receiver
      ? lang === "en" ? ` This month's pot goes to ${receiver}.` : ` القبض الشهر ده لـ ${receiver}.`
      : "";
  return lang === "en"
    ? `🗓️ Tomorrow is pay day for ${q(g.name)}: ${money(g, g.amount, lang)} for ${monthName(month, lang)}.${turn}`
    : `🗓️ بكرة ميعاد قسط «${g.name}»: ${money(g, g.amount, lang)} عن ${monthName(month, lang)}.${turn}`;
}

/** On pay day evening, to the organizer: where the round stands. */
export function ownerDayLine(lang: Lang, g: Gameya, round: number, month: string): string {
  const s = roundState(g, round);
  if (s.allPaid) return allPaidLine(lang, g, month, s.receiver?.name ?? null);
  const names = s.unpaid.map((m) => m.name);
  const shown = names.slice(0, 5).join(lang === "en" ? ", " : "، ") + (names.length > 5 ? (lang === "en" ? ` and ${names.length - 5} more` : ` و${names.length - 5} كمان`) : "");
  return lang === "en"
    ? `📒 Pay day in ${q(g.name)}: ${s.paid.length} of ${g.members.length} paid. Still to pay: ${shown}. Want me to remind them?`
    : `📒 النهارده ميعاد قسط «${g.name}»: دفع ${s.paid.length} من ${g.members.length}. فاضل: ${shown}. أفكّرهم؟`;
}

/** The organizer's "remind them" in a Zaki member's chat. */
export function nudgeLine(lang: Lang, g: Pick<Gameya, "name" | "amount" | "currency">, month: string, owner: string | null): string {
  return lang === "en"
    ? `🔔 ${who(lang, owner)} is reminding you about ${q(g.name)}: ${money(g, g.amount, lang)} for ${monthName(month, lang)}.`
    : `🔔 تفكير من ${who(lang, owner)}: قسط «${g.name}» عن ${monthName(month, lang)}، ${money(g, g.amount, lang)}.`;
}

/** WhatsApp text the organizer sends from their own number (the whole book). */
export function shareText(lang: Lang, g: Gameya): string {
  const turns = g.members.map((m) => `${m.turn}. ${m.name}: ${monthName(m.month, lang)}`).join("\n");
  return lang === "en"
    ? `Our gam'eya ${q(g.name)}: ${money(g, g.amount, lang)} a month, pay day the ${g.pay_day}th. Pot ${money(g, g.pot, lang)}.\n${turns}\nWho paid and whose turn it is, always up to date: ${g.url}`
    : `جمعيتنا «${g.name}»: ${money(g, g.amount, lang)} في الشهر، القسط يوم ${g.pay_day}. القبض ${money(g, g.pot, lang)}.\n${turns}\nمين دفع ودور مين، دايماً محدّث هنا: ${g.url}`;
}

/** WhatsApp text for the ones who haven't paid this round. */
export function remindText(lang: Lang, g: Gameya, round: number, month: string): string {
  const s = roundState(g, round);
  const names = s.unpaid.map((m) => m.name).join(lang === "en" ? ", " : "، ");
  const pay = g.instapay ? (lang === "en" ? `\nInstaPay: ${g.instapay}` : `\nإنستاباي: ${g.instapay}`) : "";
  return lang === "en"
    ? `A gentle reminder 🌸 ${q(g.name)}: ${money(g, g.amount, lang)} for ${monthName(month, lang)}, pay day the ${g.pay_day}th.${names ? ` Still to pay: ${names}.` : ""}${s.receiver ? ` This month's pot goes to ${s.receiver.name}.` : ""}${pay}\n${g.url}`
    : `تفكير لطيف 🌸 قسط «${g.name}» عن ${monthName(month, lang)}: ${money(g, g.amount, lang)}، يوم ${g.pay_day}.${names ? ` فاضل: ${names}.` : ""}${s.receiver ? ` القبض الشهر ده لـ ${s.receiver.name}.` : ""}${pay}\n${g.url}`;
}
