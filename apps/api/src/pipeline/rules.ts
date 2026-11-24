/**
 * Rules fast path (PRD §6: "rules first; Claude only when rules can't").
 * Handles the messages that need no AI, and a keyword safety net for crisis signals
 * that runs on every message regardless of what the model says.
 */

/** How the user wrote. Franco is Egyptian Arabic typed in Latin letters and digits. */
export type Script = "arabic" | "franco" | "english";
/** What the friend writes back. It reads Franco but never writes it: Franco gets Arabic letters. */
export type ReplyLang = "arabic" | "english";
export const replyLang = (script: Script): ReplyLang => (script === "english" ? "english" : "arabic");

const ARABIC_RE = /[\u0600-\u06FF]/;
// A digit used as a letter next to a Latin letter ("3andy", "sa3a", "5amis", "ro7t")…
const DIGIT_LETTER_RE = /[a-z][235789]|[235789][a-z]/;
// …but not English number forms ("3pm", "2nd", "5k", "7am", "mp3", "h2o").
const ENGLISH_NUMBERISH_RE = /^(\d+(am|pm|st|nd|rd|th|k|m|kg|km|gb|mb|x|d|h|min|mins|s)?|[a-z]{1,2}\d+[a-z]?)$/;
const FRANCO_WORDS = new Set([
  "ana", "enta", "enty", "enti", "e7na", "howa", "heya", "ezay", "ezayak", "ezayek", "izzay", "ezzay", "keda", "kda", "mesh", "msh", "mish",
  "leh", "eh", "aywa", "aiwa", "tamam", "bokra", "enharda", "elnaharda", "embare7", "yalla", "inshallah", "wallahi", "lazem", "fakarny",
  "fakkarny", "fakarni", "akalem", "bas", "bass", "awi", "awy", "gedan", "kwayes", "kowayes", "tab", "tayeb", "delwa2ty", "shokran",
  "ma3lesh", "5alas", "khalas", "mafeesh", "mafish", "feen", "fein", "emta", "leeh", "3ashan", "bta3", "bta3ty", "bta3y", "elly",
  "habibi", "sa7by", "mama", "baba", "ya", "yom", "sa3a", "gai", "gaya", "ray7", "ray7a", "kaman", "tany", "tani", "kol", "7aga",
]);
// Too common in English to count for much on their own.
const WEAK_FRANCO_WORDS = new Set(["el", "w", "fe", "fi", "da", "di", "ma3", "men", "law", "wala", "aw", "abl", "ba3d", "kan", "la"]);

/**
 * Arabic letters → "arabic". Latin letters → "franco" when the words are Arabic, else
 * "english". One Franco word in an English sentence ("ya3ni Ahmed borrowed 500 again")
 * stays English.
 */
export function detectScript(text: string): Script {
  if (ARABIC_RE.test(text)) return "arabic";
  const words = text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
  const letterWords = words.filter((w) => /[a-z]/.test(w));
  if (letterWords.length === 0) return "english";
  let strong = 0;
  let weak = 0;
  for (const w of letterWords) {
    if (FRANCO_WORDS.has(w) || (DIGIT_LETTER_RE.test(w) && !ENGLISH_NUMBERISH_RE.test(w))) strong++;
    else if (WEAK_FRANCO_WORDS.has(w)) weak++;
  }
  if (strong >= 2) return "franco";
  if (strong === 1 && letterWords.length <= 6) return "franco";
  return strong >= 1 && (strong + weak) / letterWords.length >= 0.4 ? "franco" : "english";
}

// Words that mark a Latin message as English when nothing marks it as Franco.
const ENGLISH_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "i", "i'm", "im", "my", "me", "you", "your", "it", "it's", "to", "at", "on", "in", "of", "for",
  "and", "but", "with", "what", "when", "how", "why", "who", "do", "did", "have", "has", "need", "want", "remind", "please", "thanks",
  "thank", "hello", "hi", "hey", "yes", "no", "not", "this", "that", "today", "tomorrow", "tonight", "good", "morning", "can", "will",
]);

/** A Latin message that shows no language by itself: a name, "ok", "lol", a number with a word. */
export function isAmbiguousLatin(text: string): boolean {
  if (ARABIC_RE.test(text) || detectScript(text) !== "english") return false;
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  return words.length <= 3 && !words.some((w) => ENGLISH_WORDS.has(w));
}

/**
 * The script of the latest message, read in context: "yara" after a Franco conversation
 * continues that conversation, it is not a switch to English. `texts` is oldest first.
 */
export function detectScriptInContext(texts: string[], fallback: Script = "english"): Script {
  const last = texts.at(-1) ?? "";
  if (!isAmbiguousLatin(last)) return detectScript(last);
  for (let i = texts.length - 2; i >= 0; i--) {
    const t = texts[i]!;
    if (/[a-z\u0600-\u06FF]/i.test(t) && !isAmbiguousLatin(t)) return detectScript(t);
  }
  return fallback;
}

const norm = (t: string) => t.trim().toLowerCase().replace(/[.!؟?،,\s]+/g, " ").trim();

const THANKS = new Set([
  "thanks", "thank you", "thx", "ty", "thanks a lot", "merci", "mersi", "shokran", "shukran", "tslam", "teslam",
  "شكرا", "شكراً", "متشكر", "متشكرة", "تسلم", "تسلمي", "ميرسي", "تسلم ايدك",
]);

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|‍|️|\s)+$/u;

const THANKS_REPLIES: Record<ReplyLang, string[]> = {
  arabic: ["العفو يا جميل 😊", "ولا يهمك!", "على إيه بس، أنا هنا."],
  english: ["Anytime 😊", "Of course!", "That's what I'm here for."],
};
const EMOJI_REPLIES: Record<ReplyLang, string[]> = {
  arabic: ["😄"],
  english: ["😄"],
};

/**
 * A canned friend reply when no AI is needed, else null. Only for messages that carry no
 * information (thanks, a lone emoji); anything that could contain a plan goes to the model.
 */
export function fastReply(text: string, langHint: ReplyLang, pick: (n: number) => number = (n) => Math.floor(Math.random() * n)): string | null {
  const t = norm(text);
  if (!t) return null;
  const script: ReplyLang = ARABIC_RE.test(t) ? "arabic" : langHint;
  if (THANKS.has(t)) {
    const opts = THANKS_REPLIES[script];
    return opts[pick(opts.length)] ?? null;
  }
  if (EMOJI_ONLY.test(text)) {
    const opts = EMOJI_REPLIES[script];
    return opts[pick(opts.length)] ?? null;
  }
  return null;
}

/** Crisis keywords (Arabic script, Franco, English). A safety net; the model also flags crisis. */
const CRISIS_PATTERNS: RegExp[] = [
  /\b(kill myself|killing myself|suicid\w*|end my life|want to die|wanna die|hurt myself|self[- ]harm|no reason to live)\b/i,
  /(انتحر|انتحار|اقتل نفسي|أقتل نفسي|عايز اموت|عايزة اموت|عاوز اموت|نفسي اموت|أنهي حياتي|انهي حياتي|اأذي نفسي|أذي نفسي|مش عايز اعيش|مش عايزة اعيش)/,
  /\b(ant[ae]?7ar|a2tel nafsy|a2tel nafsi|3ayez amoot|3ayza amoot|nefsy amoot|mesh 3ayez a3eesh|msh 3ayez a3ish)\b/i,
];

/** Arabic is typed with or without hamzas and diacritics ("أعيش" / "اعيش"); match both. */
const foldArabic = (t: string) => t.replace(/[\u064B-\u0652\u0640]/g, "").replace(/[أإآٱ]/g, "ا");

export function looksLikeCrisis(text: string): boolean {
  const folded = foldArabic(text);
  return CRISIS_PATTERNS.some((re) => re.test(text) || re.test(folded));
}

/**
 * A wider net than the crisis keywords: signs of distress that must reach Zaki even when the
 * free AI allowance is used up (the model then decides whether it is a crisis). Never used to
 * add the helpline by itself, only to make sure the message is answered by a caring reply.
 */
const DISTRESS_PATTERNS: RegExp[] = [
  /\b(depress\w*|hopeless|worthless|can'?t go on|can'?t take (it|this) anymore|give up on (everything|life)|nobody cares|no one cares|so alone|all alone|falling apart|panic attack|breaking down|i'?m not ok(ay)?)\b/i,
  /(مكتئب|اكتئاب|مخنوق|مخنوقه|يائس|يائسه|مش قادر اكمل|مش قادره اكمل|مبقتش قادر|مبقتش قادره|تعبت من كل حاجه|تعبت من حياتي|زهقت من حياتي|زهقت من نفسي|محدش حاسس بيا|محدش بيحبني|لوحدي خالص|ملوش لازمه|ماليش لازمه|مليش لازمه|مفيش فايده|انهرت|منهار|منهاره|نوبه هلع|مش كويس خالص|مش كويسه خالص|حياتي وحشه)/,
  /\b(mekte2eb|mekta2eb|ekte2ab|m5no2|ma5no2|makhno2|mesh 2ader akamel|msh 2ader akamel|zh2t men hayaty|ma7adsh 7ases beya)\b/i,
];

/** Distress signal (includes every crisis keyword). */
export function looksDistressed(text: string): boolean {
  const folded = foldArabic(text).replace(/ة/g, "ه").replace(/ى/g, "ي");
  return looksLikeCrisis(text) || DISTRESS_PATTERNS.some((re) => re.test(text) || re.test(folded));
}

/**
 * Reminder work stays free past the AI allowance: asking for a reminder, and the Done / Later
 * lines the notification buttons send ("خلصت «…» ✅", "فكرني بـ«…» كمان ساعة").
 */
const REMINDER_WORK = /(منبه|منبّه|صحيني|صحّيني|\balarm\b|\bmnabeh\b|\bmonabeh\b|\bsa7eny\b|\bsa7eeny\b|فكرني|فكريني|فكّرني|فكّريني|ذكرني|ذكريني|نبهني|نبهيني|\bremind me\b|\breminder\b|\bfakarny\b|\bfakkarny\b|\bfakarni\b|\bfakkarni\b|خلصت «|^done: )/i;
export function looksLikeReminderWork(text: string): boolean {
  return REMINDER_WORK.test(text.trim());
}

/**
 * The user asked for an alarm (not just a reminder). The model sometimes said "done" but left
 * alarm false, so the reminder never rang as an alarm; the pipeline sets it from this.
 * "بلاش منبه" / "no alarm" / "شيل المنبه" turn it off instead.
 */
const ALARM_ON = /(منبه|منبّه|صحيني|صحّيني|صحيني|\balarm\b|\bmnabeh\b|\bmonabeh\b|\bsa7eny\b|\bsa7eeny\b|\bwake me\b)/i;
const ALARM_OFF = /(بلاش|من غير|مش عايز|شيل|الغي|ألغي|إلغي|وقف|\bno\b|\bwithout\b|\bstop\b|\bcancel\b|\bremove\b|\bmesh\b|\bbalash\b|\bshil\b)\s*(ال)?(منبه|منبّه|\balarm\b|\bmnabeh\b|\bel mnabeh\b)/i;
export function wantsAlarm(text: string): boolean | null {
  const t = text.trim();
  if (ALARM_OFF.test(t)) return false;
  return ALARM_ON.test(t) ? true : null;
}

const HELPLINE_LEAD: Record<ReplyLang, string> = {
  arabic: "أنا جنبك. لو حاسس إنك ممكن تأذي نفسك، كلّم حد بتثق فيه دلوقتي، أو اتصل بالخط الساخن:",
  english: "I'm here with you. If you might hurt yourself, please reach out to someone you trust right now, or call:",
};

export function helplineMessage(script: ReplyLang, helpline: string): string {
  return `${HELPLINE_LEAD[script]} ${helpline}`;
}

/** Shown when the AI is unavailable; the user's message is already saved. */
export const FALLBACK_REPLY: Record<ReplyLang, string> = {
  arabic: "معلش، دماغي هنجت ثانية 😅 قولّي تاني؟",
  english: "Sorry, my brain froze for a second 😅 Say that again?",
};
