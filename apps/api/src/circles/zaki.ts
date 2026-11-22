import { normalize } from "../trackers/match";
import type { Lang } from "../tasks/rules";
import { summaryLines } from "./summary";

/**
 * @Zaki in a circle: members ask Zaki for something in the feed ("زكي فكّر الكل بغدا الجمعة").
 * Rules only, no AI call: Zaki can remind everyone, give the week's summary, or ask everyone to
 * check in, and says what it can do otherwise. Its answers are stored as a template key plus data
 * and written per reader language, never as model text.
 */
export type ZakiAsk = { kind: "remind"; what: string } | { kind: "summary" } | { kind: "checkin" } | { kind: "help" };

const ADDRESS = /^\s*(?:@\s*)?(?:زكي|زكى|zaki)\s*[،,:!.\-]?\s*/i;

/** Is this text talking to Zaki? A comment must start with his name; the feed's Zaki box always is. */
export const addressesZaki = (text: string) => ADDRESS.test(text);

export function parseZakiAsk(text: string): ZakiAsk {
  const body = text.replace(ADDRESS, "").trim();
  const t = normalize(body);
  const remind = t.match(/^(?:من فضلك\s+|لو سمحت\s+|please\s+)?(?:فكر|ذكر|فكرهم|فكر الكل|فكرنا|remind)(?:\s+(?:الكل|كله|كلنا|everyone|everybody|us|all|them))?\s*(?:ب|بـ|ان|إن|about|to|of)?\s*(.*)$/);
  if (remind) {
    // Keep the member's own words for what to remember (original text, not normalized).
    const words = body.split(/\s+/);
    const skip = normalize(body).split(/\s+/).length - (remind[1] ? remind[1].split(/\s+/).length : 0);
    const what = words.slice(skip).join(" ").replace(/^(?:ب|بـ)\s*/, "").trim();
    return what ? { kind: "remind", what: what.slice(0, 120) } : { kind: "help" };
  }
  if (/ملخص|لخص|الاسبوع|اسبوع|summary|this week|recap/.test(t)) return { kind: "summary" };
  if (/طمن|اطمن|طمنوني|check ?in|is everyone ok|everyone ok|الكل كويس/.test(t)) return { kind: "checkin" };
  return { kind: "help" };
}

export interface SummaryData {
  done: (string | null)[];
  open: number;
  checkins: number;
}

/** Zaki's comment for an ask, in the reader's language. `event` = "zaki:<kind>[|data]". */
export function zakiCommentLine(lang: Lang, event: string): string | null {
  const ar = lang === "ar";
  const bar = event.indexOf("|");
  const key = bar === -1 ? event : event.slice(0, bar);
  const data = bar === -1 ? "" : event.slice(bar + 1);
  switch (key) {
    case "zaki:reminded": {
      const n = Number(data) || 0;
      return ar ? `تمام، فكّرت ${n === 1 ? "حد واحد" : `${n} في الدايرة`} في الشات بتاعهم 💛` : `Done, I reminded ${n === 1 ? "one person" : `${n} people`} in their chats 💛`;
    }
    case "zaki:too_soon":
      return ar ? "لسه مفكّرهم من شوية. نديهم فرصة شوية وبعدين أفكّرهم تاني 🙂" : "I reminded everyone a little while ago. Let's give them a bit, then I'll try again 🙂";
    case "zaki:checkin": {
      const n = Number(data) || 0;
      return ar ? `سألت ${n === 1 ? "حد واحد" : `${n} في الدايرة`} يطمّنوكم بدوسة 💛` : `I asked ${n === 1 ? "one person" : `${n} people`} to check in with one tap 💛`;
    }
    case "zaki:summary": {
      try {
        const week = JSON.parse(data) as SummaryData;
        return summaryLines(lang, week).join("\n");
      } catch {
        return null;
      }
    }
    case "zaki:locked":
      return ar ? "ملخّص الأسبوع من مميزات زكي برو بعد تجربة الدايرة 🌟" : "The weekly summary is a Zaki Pro extra after the circle's trial 🌟";
    case "zaki:help":
      return ar
        ? "أقدر هنا أفكّر الكل بحاجة («زكي فكّر الكل بغدا الجمعة»)، أو أعمل ملخّص الأسبوع، أو أطلب من الكل يطمّنوا 💛"
        : "Here I can remind everyone of something (“Zaki, remind everyone about Friday lunch”), give the week's summary, or ask everyone to check in 💛";
    default:
      return null;
  }
}

/** What each other member gets in their chat when someone asks Zaki to remind everyone. */
export function circleReminderLine(lang: Lang, from: string | null, circle: string, what: string): string {
  const who = from ?? (lang === "ar" ? "حد من الدايرة" : "Someone in the circle");
  return lang === "ar" ? `تذكير من ${who} في «${circle}»: ${what} 💛` : `A reminder from ${who} in “${circle}”: ${what} 💛`;
}

/** One @Zaki "remind everyone" per member per circle in this window. */
export const REMIND_ALL_GAP_HOURS = 3;
