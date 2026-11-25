import { TRACKER_TEMPLATES, type TrackerKind } from "@fakkarni/shared";

/**
 * Rules that read "I did it" messages for trackers, so they cost no AI call and never touch
 * the free allowance. Deliberately strict: anything unclear falls through to the model.
 */
export interface TrackerHit {
  kind: TrackerKind;
  amount: number;
}

/** Lower-case, Western digits, no diacritics, one spelling for alef / yaa / taa marbuta. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[٬,](?=\d{3})/g, "")
    .trim();
}

// Questions, plans, reminders and "not yet" are never a log entry.
// Glued negation too: "مشربتش", "ماصليتش", "ma shrebtsh", "mashrebtesh".
const NEGATED = /(?:^|\s)(?:ما ?|م)\S{2,}ش(?:\s|$)|\bma ?\S{3,}(?:tsh|tesh|sh)\b/;
const NOT_A_LOG = /[?؟]|فكرني|فكريني|remind|بكره|tomorrow|هشرب|هروح|هصلي|هاخد|هذاكر|هدفع|will |going to|gonna|عايز|عاوز|محتاج|لازم|need to|want to|should|مش |ما |لسه|نسيت|\bnot\b|n't|never|forgot|لو |\bif\b/;
const DEBT_WORDS = /سلف|استلف|عليا|ليا |عليه|\bowe|\blent\b|borrow|رجع|\bback\b/;

const firstNumber = (t: string): number | null => {
  const m = t.match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
};
const PRAYERS = [/فجر|fajr/, /ضهر|ظهر|dhuhr|zuhr|duhr/, /عصر|asr/, /مغرب|maghrib/, /عشا|isha/];
const smallCount = (t: string, two: RegExp, max: number): number => {
  const n = firstNumber(t);
  if (n !== null && n >= 1 && n <= max && Number.isInteger(n)) return n;
  return two.test(t) ? 2 : 1;
};

const MATCHERS: Record<Exclude<TrackerKind, "custom">, (t: string) => number | null> = {
  // The subject word itself is required: "شربت كوباية شاي" / "had a cup of coffee" is not water.
  water: (t) => (/(شربت|drank|had ).*(ميه|مايه|مياه|water)/.test(t) ? smallCount(t, /كوبايتين|كوبين|two|ازازتين/, 20) : null),
  prayer: (t) => (/(^|\s)(صليت|prayed)/.test(t) ? Math.max(1, PRAYERS.filter((p) => p.test(t)).length) : null),
  gym: (t) => (/(روحت|رحت|خلصت|لعبت|went|did|finished|hit).*(جيم|تمرين|gym|workout)|اتمرنت|worked out/.test(t) ? 1 : null),
  // "read 30 pages of my novel" is not Quran: pages count only with the Quran or the daily wird named.
  quran: (t) => (/(قريت|قرات|read).*(قران|quran|الورد|وردي|wird)/.test(t) ? smallCount(t, /صفحتين|two pages/, 604) : null),
  medicine: (t) => (/(خدت|اخدت|took).*(دوا|علاج|برشام|حبايه|medicine|meds|pill)/.test(t) ? 1 : null),
  study: (t) => (/(^|\s)(ذاكرت|studied)/.test(t) ? smallCount(t, /ساعتين|two hours/, 16) : null),
  spending: (t) => (/(صرفت|دفعت|spent|paid)\s/.test(t) && !DEBT_WORDS.test(t) ? positive(firstNumber(t)) : null),
  fasting: (t) => (/(^|\s)(صمت|صايم النهارده|صايمه النهارده|fasted|i fasted)(\s|$)/.test(t) ? 1 : null),
  charity: (t) => (/(اتصدقت|تصدقت|طلعت صدقه|donated|gave charity|gave sadaqa)\s/.test(t) && !DEBT_WORDS.test(t) ? positive(firstNumber(t)) : null),
  savings: (t) => (/(حوشت|شلت|saved|put aside)\s/.test(t) && !DEBT_WORDS.test(t) ? positive(firstNumber(t)) : null),
};
function positive(n: number | null): number | null {
  return n !== null && n > 0 && n <= 100_000_000 ? n : null;
}

/** "شربت كوبايتين مية" → { kind: "water", amount: 2 }, only for kinds the user follows. */
export function matchTrackerLog(text: string, kinds: readonly TrackerKind[]): TrackerHit | null {
  const t = normalize(text);
  if (t.length > 80 || t.split(/\s+/).length > 9 || NOT_A_LOG.test(t) || NEGATED.test(t)) return null;
  for (const kind of kinds) {
    if (kind === "custom") continue;
    const amount = MATCHERS[kind](t);
    if (amount !== null) return { kind, amount };
  }
  return null;
}

const SUBJECTS: [Exclude<TrackerKind, "custom">, RegExp][] = [
  ["water", /ميه|مايه|مياه|water/],
  ["prayer", /صلا|صلوات|prayer/],
  ["gym", /جيم|تمرين|gym|workout/],
  ["quran", /قران|quran/],
  ["medicine", /دوا|علاج|medicine|meds/],
  ["study", /مذاكر|studying|study/],
  ["spending", /مصاريف|مصروف|spending|expenses/],
  ["savings", /تحويش|ادخار|savings|saving/],
  ["fasting", /صيام|صومي|fasting/],
  ["charity", /صدق|charity|sadaqa/],
];

/** "track my water" / "تابع معايا المية" → the template to start. */
export function matchTrackCommand(text: string): Exclude<TrackerKind, "custom"> | null {
  const t = normalize(text);
  if (t.split(/\s+/).length > 7 || /[?؟]/.test(t)) return null;
  if (!/(^|\s)(track|تابع|اتابع|تتابع|نتابع)(\s|$)/.test(t)) return null;
  return SUBJECTS.find(([, re]) => re.test(t))?.[0] ?? null;
}

/** Does an item title (a reminder) talk about the same thing as this tracker kind? */
export function titleMatchesKind(title: string, kind: TrackerKind): boolean {
  const re = SUBJECTS.find(([k]) => k === kind)?.[1];
  return re ? re.test(normalize(title)) : false;
}

export const ALL_KINDS = Object.keys(TRACKER_TEMPLATES) as TrackerKind[];
