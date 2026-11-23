/**
 * Chat first: a new user sees Zaki's chat and Me. Other places are introduced BY ZAKI in the
 * chat when the conversation shows they're needed (money talk: the Daftar; family or friends:
 * People; the third active day: Today), and open when the user taps the card (owner decision,
 * 2026-11-23: never a tab appearing silently). Asking for a place ("open the Daftar") opens it
 * at once; "what can you do?" introduces everything not open yet. Pure: the store in
 * unlock-store.ts persists the state and writes Zaki's message.
 */
export type Feature = "daftar" | "people" | "today";
export const ALL_FEATURES: Feature[] = ["daftar", "people", "today"];

export interface UnlockState {
  features: Feature[];
  /** Places Zaki already introduced that the user hasn't opened yet (never introduced twice by keywords). */
  offered: Feature[];
  /** Local dates (YYYY-MM-DD) the user wrote to Zaki, newest last, at most 7 kept. */
  days: string[];
}

/** What one message changes: places opened now, places Zaki should introduce, and the overview. */
export interface UnlockStep {
  state: UnlockState;
  opened: Feature[];
  introduce: Feature[];
  /** "What can you do?": Zaki explains every place, open or not. */
  overview: boolean;
}

/** Days with a message before Today (plans, trackers, A space to reflect) is introduced. */
export const TODAY_AFTER_DAYS = 3;

const MONEY = /سلف|سلّف|فلوس|جنيه|ج\.م|دين|ديون|عليا\s*\d|ليا\s*عند|ليا\s*\d|حساب\b|اتحاسب|احسبلي|owe|owes|owed|lent|lend|borrow|money|debt|\begp\b|pounds?\b|paid me|pay (me|back)|دفعت\s*\d|صرفت\s*\d|قبضت|مرتب|مصاريف|ميزانية|\bspent\b|\bpaid \d|budget|expenses?|salary|split/i;
const PEOPLE = /ماما|بابا|أمي|امي|ابويا|أبويا|اخويا|أخويا|اختي|أختي|مراتي|جوزي|ابني|بنتي|ولادي|العيال|تيتة|جدو|جدتي|صاحبي|صاحبتي|صحابي|العيلة|العيله|الشلة|\bmom\b|\bmum\b|\bdad\b|mother|father|sister|brother|\bwife\b|husband|\bson\b|daughter|\bkids\b|grandma|grandpa|family|friends?\b/i;

// Asking for a place by name: an "open / show / where" word near the place's name.
const ASK = "(افتح|إفتح|افتحلي|وريني|ورّيني|فين|عايز اشوف|عاوز اشوف|عايزة اشوف|show|open|where)";
const PLACE: Record<Feature, string> = {
  daftar: "(الدفتر|دفتر|الحسابات|daftar|money book|money)",
  people: "(الدواير|الدوائر|دايرة|ناسي|ناسك|people|circles?)",
  today: "(يومي|اليوم|النهارده|today|my day)",
};
const ASKS: Record<Feature, RegExp> = Object.fromEntries(
  ALL_FEATURES.map((f) => [f, new RegExp(`${ASK}.{0,15}${PLACE[f]}`, "i")]),
) as Record<Feature, RegExp>;
const OVERVIEW = /(بتعمل|تعمل|تقدر تعمل|بتعرف تعمل|بتقدر تعمل)\s*(ايه|إيه)|what can you do|what do you do|what else can you|إمكانياتك|مميزاتك/i;

export function parseUnlock(raw: string | null): UnlockState | null {
  if (raw === null) return null;
  const only = (list: unknown) => (Array.isArray(list) ? list : []).filter((f): f is Feature => ALL_FEATURES.includes(f as Feature));
  try {
    const v = JSON.parse(raw) as Partial<UnlockState>;
    return {
      features: only(v.features),
      offered: only(v.offered),
      days: (Array.isArray(v.days) ? v.days : []).filter((d) => typeof d === "string").slice(-7),
    };
  } catch {
    return { features: [], offered: [], days: [] };
  }
}

/** Places a message talks about (money: the Daftar; family or friends: People). */
export function featuresFromText(text: string): Feature[] {
  const out: Feature[] = [];
  if (MONEY.test(text)) out.push("daftar");
  if (PEOPLE.test(text)) out.push("people");
  return out;
}

/** Places the message asks to open by name ("افتح الدفتر", "show me people"). */
export const askedFor = (text: string): Feature[] => ALL_FEATURES.filter((f) => ASKS[f].test(text));

export const asksOverview = (text: string) => OVERVIEW.test(text);

const uniq = <T,>(list: T[]) => list.filter((x, i) => list.indexOf(x) === i);

/** Records one user message: its day, what it opens now and what Zaki should introduce. */
export function afterMessage(state: UnlockState, text: string, localDay: string): UnlockStep {
  const days = state.days.includes(localDay) ? state.days : [...state.days, localDay].slice(-7);
  const closed = (f: Feature) => !state.features.includes(f);
  // Asked by name: open now (Zaki still says what it is).
  const opened = askedFor(text).filter(closed);
  const overview = asksOverview(text);
  const talkedAbout = featuresFromText(text);
  if (days.length >= TODAY_AFTER_DAYS) talkedAbout.push("today");
  const introduce = overview
    ? []
    : uniq([...opened, ...talkedAbout.filter((f) => closed(f) && !state.offered.includes(f) && !opened.includes(f))]);
  const offered = uniq([...state.offered, ...introduce.filter((f) => !opened.includes(f))]).filter((f) => !opened.includes(f));
  return { state: { features: [...state.features, ...opened], offered, days }, opened, introduce, overview };
}

/** Opens a feature (the user tapped Zaki's card, joined a circle, got a Daftar link). */
export function open(state: UnlockState, feature: Feature): { state: UnlockState; opened: Feature[] } {
  if (state.features.includes(feature)) return { state, opened: [] };
  return { state: { ...state, features: [...state.features, feature], offered: state.offered.filter((f) => f !== feature) }, opened: [feature] };
}

/** The tab route of each place, used by Zaki's Open card. */
export const FEATURE_ROUTE: Record<Feature, string> = { daftar: "/money", people: "/circles", today: "/today" };

/** Which place a route belongs to, if any (opening a card there opens the tab). */
export function featureOfRoute(route: string): Feature | null {
  if (route.startsWith("/money") || route.startsWith("/daftar") || route.startsWith("/split")) return "daftar";
  if (route.startsWith("/circle")) return "people";
  if (route.startsWith("/today") || route.startsWith("/trackers") || route.startsWith("/upcoming")) return "today";
  return null;
}

export const localDayOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
