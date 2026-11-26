import { z } from "zod";
import { fold } from "./understand/text";

/**
 * Place reminders ("remind me to buy bread when I'm at the supermarket").
 *
 * Privacy rule: where a place is (its coordinates) lives only on the phone. The server only ever
 * sees the words the user typed for it ("the supermarket", "الشغل"), stored on the item as
 * `place`. The phone matches those words against the places saved on it and fires the reminder
 * itself when it reaches one. There is no live tracking and nothing is sent when a place is
 * reached, except an "I've arrived" check-in in words, and only when the user taps it.
 *
 * Pure: no I/O, no clock. Shared by the server (pipeline) and the phone.
 */

/** Fire when the phone arrives at the place, or when it leaves it. */
export const PlaceOn = z.enum(["arrive", "leave"]);
export type PlaceOn = z.infer<typeof PlaceOn>;

/**
 * What kind of place a saved place is. The same names as the household lists' `ListPlace`
 * (so a list tagged "grocery" pops up at a saved place of kind "grocery"), plus school / work.
 */
export const PlaceKind = z.enum(["grocery", "pharmacy", "bakery", "butcher", "home", "school", "work", "other"]);
export type PlaceKind = z.infer<typeof PlaceKind>;

export const MAX_PLACE_NAME = 60;
export const PlaceName = z.string().trim().min(1).max(MAX_PLACE_NAME);

/** Words that name a kind of place, folded (see `fold`). Arabic, Franco and English. */
const KIND_WORDS: [PlaceKind, string[]][] = [
  ["grocery", ["supermarket", "super market", "market", "grocery", "groceries", "grocer", "hypermarket", "carrefour", "spinneys", "metro", "kazyon", "seoudi", "سوبر ماركت", "سوبرماركت", "السوبر", "سوبر", "ماركت", "البقال", "بقال", "البقاله", "بقاله", "هايبر", "كارفور", "سبينيس", "مترو", "كازيون", "سعودي", "el super", "super", "ba2al", "el ba2al", "be2ala"]],
  ["pharmacy", ["pharmacy", "chemist", "drugstore", "صيدليه", "الصيدليه", "اجزاخانه", "الاجزاخانه", "saydaleya", "sydalya", "agzakhana", "agza5ana", "el saydaleya"]],
  ["bakery", ["bakery", "baker", "فرن", "الفرن", "مخبز", "المخبز", "furn", "forn", "el forn", "el furn"]],
  ["butcher", ["butcher", "جزار", "الجزار", "gazar", "el gazar"]],
  ["home", ["home", "house", "البيت", "بيت", "بيتي", "el beit", "el bait", "beit", "bait", "elbeit"]],
  ["school", ["school", "المدرسه", "مدرسه", "madrasa", "el madrasa", "nursery", "الحضانه", "حضانه", "kindergarten", "club", "النادي", "نادي", "el nady", "nady", "training", "التمرين", "el tamreen"]],
  ["work", ["work", "office", "the office", "job", "الشغل", "شغل", "شغلي", "المكتب", "مكتب", "الشركه", "el shoghl", "shoghl", "el sho3'l", "el maktab", "el sherka"]],
];

/** A place's words in one spelling, for matching: folded, no "the" / "ال" / "el" in front, single spaces. */
export function placeKey(name: string): string {
  return fold(name)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(the|my|a|an|el|al|l)\s+/, "")
    .replace(/^ال(?=\S{2,})/, "")
    .replace(/\s+/g, "");
}

const KIND_KEYS: [PlaceKind, Set<string>][] = KIND_WORDS.map(([k, words]) => [k, new Set(words.map(placeKey))]);

/** The kind of place the words name ("the supermarket" → grocery), or null. */
export function kindOfPlace(name: string): PlaceKind | null {
  const key = placeKey(name);
  if (!key) return null;
  for (const [kind, keys] of KIND_KEYS) if (keys.has(key)) return kind;
  return null;
}

export interface SavedPlaceLike {
  id: string;
  name: string;
  kind: PlaceKind;
}

/**
 * The saved places an item's place words mean. Same words first ("Carrefour Maadi" = "carrefour
 * maadi"); otherwise, when the words name a kind ("the supermarket"), every saved place of that
 * kind (the reminder fires at whichever one the user reaches).
 */
export function placesFor<P extends SavedPlaceLike>(words: string, saved: readonly P[]): P[] {
  const key = placeKey(words);
  if (!key) return [];
  const same = saved.filter((p) => placeKey(p.name) === key);
  if (same.length) return same;
  const kind = kindOfPlace(words);
  return kind && kind !== "other" ? saved.filter((p) => p.kind === kind) : [];
}

/** Distance in metres between two points (haversine). */
export function metresBetween(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ======================================================================================
// Reading "when I'm at the supermarket" out of a message
// ======================================================================================

export interface PlaceTrigger {
  /** The place as the user wrote it, without "the" / leading prepositions ("supermarket", "السوبر ماركت"). */
  place: string;
  on: PlaceOn;
  /** Where the trigger phrase sits in the original text, to cut it out of a title. */
  start: number;
  end: number;
}

// Arabic: "لما أوصل (لـ|عند)? X", "لما أكون (في|عند|جنب|قريب من) X", "لما أروح X", "لما أعدي على X",
// "أول ما أوصل X", "لما أرجع (البيت|الشغل)" (arrive); "لما أخرج/أطلع/أمشي/أنزل/أسيب (من)? X" (leave).
const AR_LEAD = "(?:لما|لمّا|لمَا|اول ما|أول ما|أوّل ما|اما|أما|ساعة ما|وقت ما|كل ما|كل مره|كل مرة|lما)";
const AR_ARRIVE = "(?:[اأ]وصل|[اأ]كون|[اأ]روح|[اأ]رجع|[اأ]عدي|[اأ]عدّي|[اأ]عدى|[اأ]دخل|[اأ]بقى|[اأ]بقي|نوصل|نروح|نرجع|نكون)";
const AR_LEAVE = "(?:[اأ]خرج|[اأ]طلع|[اأ]مشي|[اأ]نزل|[اأ]سيب|[اأ]مشى|نخرج|نمشي)";
const AR_PREP = "(?:\\s+(?:لل|ل|الى|إلى|إلي|الي|على|علي|عند|جنب|قريب من|قرب|ف|في|فى|من|ع))?";
// The place: up to three words, stopping at a comma, a full stop, or a word that starts the rest of the sentence.
const AR_STOP = "(?:فكرني|فكريني|فكّرني|ذكرني|ذكريني|نبهني|قولي|قوليلي|عرفني|اشتري|أشتري|اجيب|أجيب|هات|عشان|علشان|ابقى|إبقى|خليني|و(?=فكرني|ذكرني|قولي|اشتري|اجيب|أجيب|هات))";
const AR_PLACE = `((?:(?!${AR_STOP})[^\\s،,.!؟?]+)(?:\\s+(?!${AR_STOP})[^\\s،,.!؟?]+){0,2})`;
const AR_RE = new RegExp(`${AR_LEAD}\\s*(${AR_ARRIVE}|${AR_LEAVE})${AR_PREP}\\s+${AR_PLACE}`, "u");

// Franco: "lama awsal (el)? X", "lama akon (fe|3and|gamb) X", "lama arou7 X", "lama arga3 X", "lama a5rog men X".
const FR_LEAD = "(?:lama|lamma|lma|awel ma|awl ma|2awel ma)";
const FR_ARRIVE = "(?:awsal|a?wsl|2awsal|akon|akoon|akun|2akon|arou7|aro7|arooh|arga3|2arga3|a3ady|a3adi|ad5ol|nawsal|nrou7)";
const FR_LEAVE = "(?:a5rog|akhrog|2a5rog|atla3|2atla3|amshy|amshi|2amshy|anzel|2anzel|aseeb)";
const FR_PREP = "(?:\\s+(?:l|le|lel|li|3and|3nd|gamb|gnb|fe|fel|f|men|mn|3ala|3al|3a))?";
const FR_STOP = "(?:fakarny|fakkarny|fkrny|fakarni|fakkarni|zakarny|2oly|oly|2olly|eshtery|ashtery|ageeb|hat|3ashan|3shan|w(?=\\s))";
const FR_PLACE = `((?:(?!${FR_STOP}\\b)[a-z0-9'3275]+)(?:\\s+(?!${FR_STOP}\\b)[a-z0-9'3275]+){0,2})`;
const FR_RE = new RegExp(`\\b${FR_LEAD}\\s+(${FR_ARRIVE}|${FR_LEAVE})${FR_PREP}\\s+${FR_PLACE}`, "i");

// English: "when I'm at/near X", "when I get to X", "when I get home", "when I arrive at X", "when I reach X",
// "next time I'm at X", "once I'm at X", "as soon as I get to X"; "when I leave X" (leave).
const EN_LEAD = "(?:when(?:ever)?|once|as soon as|next time|the next time|the moment|after)";
const EN_ARRIVE = "(?:i'?m next|i am next|i'?m|i am|i get|i arrive|i reach|i go|i pass|i stop|i walk|we get|we arrive|we'?re|i come)";
const EN_LEAVE = "(?:i leave|i'?m leaving|i head out of|i get out of|i walk out of|we leave)";
const EN_PREP = "(?:\\s+(?:at|to|near|by|in|into|back to|back at|around|close to|next to|of|from|past|through))?";
const EN_STOP = "(?:remind|tell|ping|nudge|let|to|and|please|so|then|i|i'?ll|buy|get|call|pick|grab|ask|text)";
const EN_PLACE = `((?:(?!${EN_STOP}\\b)[\\p{L}0-9'&-]+)(?:\\s+(?!${EN_STOP}\\b)[\\p{L}0-9'&-]+){0,2})`;
const EN_RE = new RegExp(`\\b${EN_LEAD}\\s+(${EN_LEAVE}|${EN_ARRIVE})${EN_PREP}\\s+${EN_PLACE}`, "iu");

// Words that end a place but were caught (time words: "when I'm home tonight").
const TRAILING = /\s+(?:tonight|today|tomorrow|later|again|next|first|please|بكره|بكرة|النهارده|النهاردة|بالليل|الصبح|تاني|bokra|enharda|belleil|el sob7|tany)$/iu;
// Not places: "when I'm free", "لما أكون فاضي", "when I get a chance", "when I get up".
const NOT_PLACE = /^(?:free|done|ready|back|up|awake|bored|sad|tired|hungry|sick|a chance|the chance|time|it|there|paid|فاضي|فاضيه|خلصت|جاهز|صاحي|زهقان|تعبان|جعان|عيان|faady|fady|5alast|gahez|sa7y|ta3ban|ga3an)$/iu;

function clean(place: string): string {
  let p = place.trim().replace(TRAILING, "").trim();
  p = p.replace(/^(?:the|my)\s+/i, "");
  // Arabic prepositions written onto the word: "للسوبر ماركت" / "عالبيت" / "فالشغل" → "السوبر ماركت".
  p = p.replace(/^(?:لل)(?=\S)/u, "ال").replace(/^(?:بال|فال|عال|وال)(?=\S{2,})/u, "ال");
  return p;
}

/**
 * Reads a place trigger out of a message, or null. "remind me to buy bread when I'm at the
 * supermarket" → { place: "supermarket", on: "arrive" }; "لما أخرج من الشغل فكرني أكلم ماما" →
 * { place: "الشغل", on: "leave" }. Conservative: only "when I … <place>" shapes, so "when I'm
 * free" or a time ("when it's 5") never reads as a place.
 */
export function parsePlaceTrigger(text: string): PlaceTrigger | null {
  const tries: [RegExp, RegExp][] = [
    [AR_RE, new RegExp(`^${AR_LEAVE}$`, "u")],
    [FR_RE, new RegExp(`^${FR_LEAVE}$`, "i")],
    [EN_RE, new RegExp(`^${EN_LEAVE}$`, "i")],
  ];
  for (const [re, leave] of tries) {
    const m = re.exec(text);
    if (!m) continue;
    // "when I get home" / "لما أرجع البيت": the place directly after the verb.
    const place = clean(m[2] ?? "");
    if (!place || NOT_PLACE.test(place)) continue;
    // A time is not a place: "when I'm at 5", "لما أوصل الساعة ٥".
    if (/^(?:\d|[٠-٩]|الساعه|الساعة|sa3a|el sa3a)/i.test(fold(place))) continue;
    const verb = fold(m[1] ?? "").replace(/\s+/g, " ");
    const on: PlaceOn = leave.test(m[1] ?? "") || leave.test(verb) ? "leave" : "arrive";
    const start = m.index;
    const end = m.index + m[0].length;
    return { place: place.slice(0, MAX_PLACE_NAME), on, start, end };
  }
  return null;
}

/**
 * The thing to do, with the place phrase and "remind me (to)" cut out: "remind me to buy bread
 * when I'm at the supermarket" → "buy bread". Falls back to the whole message when nothing is left.
 */
export function titleWithoutPlace(text: string, trigger: PlaceTrigger): string {
  const rest = `${text.slice(0, trigger.start)} ${text.slice(trigger.end)}`;
  const t = rest
    .replace(/\b(?:please|pls|plz)\b/gi, " ")
    .replace(/\b(?:remind me|can you remind me|could you remind me|remember|tell me|ping me|nudge me)\b\s*(?:to|that|about|i need to|i have to)?/gi, " ")
    .replace(/(?:^|\s)(?:يا زكي|زكي|ممكن|لو سمحت)(?=\s|$)/gu, " ")
    .replace(/(?:فكرني|فكريني|فكّرني|فكّريني|ذكرني|ذكريني|نبهني|نبّهني|قولي|قوليلي)\s*(?:ب|بـ|إني|اني|إن|ان|إنّي|انّي)?/gu, " ")
    .replace(/\b(?:fakarny|fakkarny|fkrny|fakarni|fakkarni|zakarny|2oly|oly)\b\s*(?:b|bel|en|eny|ene)?/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,،.:;\-–—]+|[\s,،.:;\-–—!؟?]+$/g, "")
    .trim();
  return t || text.trim();
}
