/**
 * Gam'eya messages read by rules (no AI call, no allowance used). Strict on purpose: the word
 * "جمعية" also means the co-op shop ("نازل الجمعية أجيب سكر"), so a message only counts when it
 * names the gam'eya AND says paid / whose turn / start one, and the paid and turn shortcuts only
 * run for someone who is in a gam'eya (else the message goes on to the model).
 */

export type GameyaIntent = { kind: "paid"; hint: string | null } | { kind: "status"; hint: string | null } | { kind: "new" };

const WORD = String.raw`(?:ال)?(?:جمعي[ةه]|جمعيت(?:ي|نا|ك|ه|ها))`;
const WORD_LATIN = String.raw`(?:el\s*|the\s+|my\s+|our\s+)?(?:gam[3'’]?[ae]?[iy]+[ae]h?|gam3eya|gam3ya|gameya|gamaeya|gam'iya|savings\s+circle|rosca)`;

const NEGATION = /(?:^|\s)(?:مدفعتش|مادفعتش|ما\s+دفعتش|لسه\s+ما|لسه\s+م|مش|لا\s|didn'?t|did\s+not|haven'?t|have\s+not|not\s+yet|madfa3t?sh|lessa\s+ma)(?:\s|$)/iu;
const PAID_AR = /(?:^|\s)(?:دفعت|سددت|سدّدت|حولت|حوّلت|بعت|دفعنا)(?:\s|$)/u;
const PAID_LATIN = /(?:^|\s)(?:paid|dafa3t|dafa3na|sadedt|7awelt)(?:\s|$)/iu;
const STATUS_AR = /(?:^|\s)(?:دور|الدور|دوري|دورك|مين|امتى|إمتى|القبض|قبض|هقبض|بقبض|فاضل)(?:\s|$)/u;
const STATUS_LATIN = /(?:^|\s)(?:whose|who'?s|who|when|turn|next|dor|doory|dori|meen|emta|2abd|ab2ad|ha2bad)(?:\s|$)/iu;
const NEW_AR = /(?:^|\s)(?:اعمل|اعملي|اعملنا|نعمل|ابدأ|ابدا|نبدأ|نبدا|افتح|عايز\s+اعمل|عايزة\s+اعمل)(?:\s|$)/u;
const NEW_LATIN = /(?:^|\s)(?:start|create|make|new|set\s+up|e3mel|n3mel|eb2a)(?:\s|$)/iu;

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** The words after the gam'eya word, as a name hint: "دفعت جمعية الشغل" → "الشغل". */
function hintAfter(text: string, re: RegExp): string | null {
  const m = text.match(re);
  if (!m) return null;
  const tail = text
    .slice((m.index ?? 0) + m[0].length)
    .replace(/[.!؟?]+$/u, "")
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(" ");
  return tail && !/^(?:بتاعت?ي|بتاعتنا|بتاعي|بتاعنا|بتاعة|عن|في|ده|دي|الشهر|this|for|of|my)$/iu.test(tail.split(" ")[0]!) ? tail : null;
}

export function readGameyaMessage(input: string): GameyaIntent | null {
  const text = clean(input);
  if (!text || text.length > 160) return null;
  const ar = new RegExp(String.raw`(?:^|\s)(?:قسط\s+)?${WORD}(?=\s|$|[.!؟?])`, "u");
  const latin = new RegExp(String.raw`(?:^|\s)${WORD_LATIN}(?=\s|$|[.!?])`, "iu");
  const named = ar.test(text) ? ar : latin.test(text) ? latin : null;
  if (!named) return null;
  const question = /[؟?]\s*$/u.test(text);
  if (NEW_AR.test(text) || NEW_LATIN.test(text)) return question && !/(?:ازاي|إزاي|how)/iu.test(text) ? null : { kind: "new" };
  if (STATUS_AR.test(text) || STATUS_LATIN.test(text) || question) return { kind: "status", hint: hintAfter(text, named) };
  // "دفعت 300 في الجمعية" is shopping at the co-op: a place word or a bare amount is not the gam'eya.
  const shop = /(?:^|\s)(?:في|ف|من|at|in|from)\s+(?:ال)?جمعي/iu.test(text) || (/(?:^|\s)[0-9٠-٩][0-9٠-٩.,٬]*(?:\s|$)/u.test(text) && !/قسط|installment|2est/iu.test(text));
  if ((PAID_AR.test(text) || PAID_LATIN.test(text)) && !NEGATION.test(text) && !shop) return { kind: "paid", hint: hintAfter(text, named) };
  return null;
}
