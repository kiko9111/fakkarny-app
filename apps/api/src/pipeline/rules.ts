/**
 * Rules fast path (PRD §6: "rules first; Claude only when rules can't").
 * Handles the messages that need no AI, and a keyword safety net for crisis signals
 * that runs on every message regardless of what the model says.
 */

export type Script = "arabic" | "franco" | "english";

const ARABIC_RE = /[؀-ۿ]/;
// Franco: Latin text using digits as Arabic letters (2, 3, 5, 7, 8, 9) or common Franco words.
const FRANCO_RE = /\b\w*[a-z][2357]\w*\b|\b(ana|enta|enty|ya3ni|3ayez|3ayza|keda|bas|mesh|msh|leh|izzay|ezay|tamam|7aga|bokra|el?nharda|yalla|inshallah|wallahi)\b/i;

export function detectScript(text: string): Script {
  if (ARABIC_RE.test(text)) return "arabic";
  if (FRANCO_RE.test(text)) return "franco";
  return "english";
}

const norm = (t: string) => t.trim().toLowerCase().replace(/[.!؟?،,\s]+/g, " ").trim();

const THANKS = new Set([
  "thanks", "thank you", "thx", "ty", "thanks a lot", "merci", "mersi", "shokran", "shukran", "tslam", "teslam",
  "شكرا", "شكراً", "متشكر", "متشكرة", "تسلم", "تسلمي", "ميرسي", "تسلم ايدك",
]);

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|‍|️|\s)+$/u;

const THANKS_REPLIES: Record<Script, string[]> = {
  arabic: ["العفو يا جميل 😊", "ولا يهمك!", "على إيه بس، أنا هنا."],
  franco: ["El 3afw 😊", "Wala yhemmak!", "3ala eh bas, ana hena."],
  english: ["Anytime 😊", "Of course!", "That's what I'm here for."],
};
const EMOJI_REPLIES: Record<Script, string[]> = {
  arabic: ["😄"],
  franco: ["😄"],
  english: ["😄"],
};

/**
 * A canned friend reply when no AI is needed, else null. Only for messages that carry no
 * information (thanks, a lone emoji); anything that could contain a plan goes to the model.
 */
export function fastReply(text: string, scriptHint: Script, pick: (n: number) => number = (n) => Math.floor(Math.random() * n)): string | null {
  const t = norm(text);
  if (!t) return null;
  const script = ARABIC_RE.test(t) ? "arabic" : scriptHint;
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

const HELPLINE_LEAD: Record<Script, string> = {
  arabic: "أنا جنبك. لو حاسس إنك ممكن تأذي نفسك، كلّم حد بتثق فيه دلوقتي، أو اتصل بالخط الساخن:",
  franco: "Ana gambak. Law 7asses enak momken t2zy nafsak, kallem 7ad betse2 feeh delwa2ty, aw etasel bel hotline:",
  english: "I'm here with you. If you might hurt yourself, please reach out to someone you trust right now, or call:",
};

export function helplineMessage(script: Script, helpline: string): string {
  return `${HELPLINE_LEAD[script]} ${helpline}`;
}

/** Shown when the AI is unavailable; the user's message is already saved. */
export const FALLBACK_REPLY: Record<Script, string> = {
  arabic: "معلش، دماغي هنجت ثانية 😅 قولّي تاني؟",
  franco: "Ma3lesh, demaghy hangat sanya 😅 2olly tany?",
  english: "Sorry, my brain froze for a second 😅 Say that again?",
};
