import type { LinkTaskStatus } from "@fakkarni/shared";

/**
 * Words for no-app links (tasks and household lists), per language. Pure. Arabic lines about
 * the other person avoid gendered verbs: the reader may be anyone.
 */
export type Lang = "ar" | "en";

/** A day and time in the creator's time zone ("Fri 28 Nov, 6:00 PM"); Latin digits in Arabic too. */
export function whenText(at: Date, tz: string, lang: Lang): string {
  const opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: tz };
  try {
    return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "ar-EG-u-nu-latn", opts).format(at);
  } catch {
    return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "ar-EG-u-nu-latn", { ...opts, timeZone: "Africa/Cairo" }).format(at);
  }
}

const by = (lang: Lang, name: string | null) => name ?? (lang === "en" ? "A friend" : "حد من حبايبك");

/** The WhatsApp text the creator sends with a new task link. */
export function taskShareText(i: { lang: Lang; otherName: string; title: string; when: string | null; url: string }): string {
  return i.lang === "en"
    ? `Hi ${i.otherName} 👋 Could you take care of this: ${i.title}${i.when ? ` (by ${i.when})` : ""}? Tap to say yes, and tap again when it's done, nothing to install: ${i.url}`
    : `أهلاً يا ${i.otherName} 👋 ممكن تخلّص دي: ${i.title}${i.when ? ` (قبل ${i.when})` : ""}؟ دوس على اللينك وقول موافق، ودوس تاني لما تخلص، من غير ما تنزّل حاجة: ${i.url}`;
}

/** The gentle reminder the creator sends once the task was accepted. */
export function taskNudgeText(i: { lang: Lang; otherName: string; title: string; url: string }): string {
  return i.lang === "en"
    ? `Hi ${i.otherName}, a little reminder about: ${i.title} 🙏 Tap "Done" here when it's finished: ${i.url}`
    : `يا ${i.otherName}، فكرة صغيرة بخصوص: ${i.title} 🙏 دوس "خلصت" هنا أول ما تخلص: ${i.url}`;
}

/** To the creator, in their chat, when the other person answers on the page. */
export function taskUpdateLine(lang: Lang, status: LinkTaskStatus, otherName: string, title: string): string {
  if (status === "accepted") return lang === "en" ? `👍 ${otherName} said yes to: ${title}` : `👍 ${otherName}: موافق على «${title}»`;
  if (status === "declined") return lang === "en" ? `${otherName} can't do it this time: ${title} 💛 Want to ask someone else?` : `${otherName}: مش هقدر المرة دي «${title}» 💛 تحب تطلبها من حد تاني؟`;
  if (status === "done") return lang === "en" ? `✅ ${otherName} finished: ${title}` : `✅ خلصت: ${title} (من ${otherName})`;
  return title;
}

/** The WhatsApp text that shares a household list link. */
export function listShareText(i: { lang: Lang; from: string | null; list: string; open: number; url: string }): string {
  return i.lang === "en"
    ? `🛒 ${by(i.lang, i.from)} shared the list «${i.list}»${i.open ? ` (${i.open} to get)` : ""}. Open it, tick what you got and add what's missing, nothing to install: ${i.url}`
    : `🛒 ${by(i.lang, i.from)} بعتلك قايمة «${i.list}»${i.open ? ` (${i.open} ${i.open === 1 ? "حاجة" : i.open <= 10 ? "حاجات" : "حاجة"})` : ""}. افتحها، علّم على اللي جبته وضيف اللي ناقص، من غير ما تنزّل حاجة: ${i.url}`;
}

/** To the list's people: someone with the link added things. */
export function webAddedLine(lang: Lang, name: string | null, list: string, things: string[]): string {
  const shown = things.slice(0, 5).join(lang === "en" ? ", " : "، ");
  const more = things.length > 5 ? (lang === "en" ? ` and ${things.length - 5} more` : ` و${things.length - 5} كمان`) : "";
  const who = name ?? (lang === "en" ? "someone with the link" : "حد معاه اللينك");
  return lang === "en" ? `🛒 ${who} added ${shown}${more} to ${list}` : `🛒 «${list}»: اتضاف ${shown}${more} (من ${who})`;
}

/** To the list's people: everything open was ticked on the web page. */
export function webAllDoneLine(lang: Lang, name: string | null, list: string, got: number): string {
  const who = name ?? (lang === "en" ? "Someone with the link" : "حد معاه اللينك");
  return lang === "en"
    ? `✅ ${who} got everything on ${list} (${got} ${got === 1 ? "thing" : "things"})`
    : `✅ «${list}» خلصت كلها: ${got} ${got === 1 ? "حاجة" : got <= 10 ? "حاجات" : "حاجة"} (مع ${who})`;
}
