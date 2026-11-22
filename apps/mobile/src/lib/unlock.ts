/**
 * Chat first: a new user sees only Zaki's chat. Other places appear when the conversation
 * shows they're needed (money talk opens the Daftar, family or friends open People), and
 * "Today" after a few active days. Pure: the store in unlock-store.ts persists the state.
 */
export type Feature = "daftar" | "people" | "today";
export const ALL_FEATURES: Feature[] = ["daftar", "people", "today"];

export interface UnlockState {
  features: Feature[];
  /** Local dates (YYYY-MM-DD) the user wrote to Zaki, newest last, at most 7 kept. */
  days: string[];
}

/** Days with a message before Today (plans, trackers, A space to reflect) shows up. */
export const TODAY_AFTER_DAYS = 3;

const MONEY = /سلف|سلّف|فلوس|جنيه|ج\.م|دين|ديون|عليا\s*\d|ليا\s*عند|ليا\s*\d|حساب\b|اتحاسب|owe|owes|owed|lent|lend|borrow|money|debt|\begp\b|pounds?\b|paid me|pay (me|back)|دفعت\s*\d|صرفت\s*\d|قبضت|مرتب|مصاريف|ميزانية|\bspent\b|\bpaid \d|budget|expenses?|salary/i;
const PEOPLE = /ماما|بابا|أمي|امي|ابويا|أبويا|اخويا|أخويا|اختي|أختي|مراتي|جوزي|ابني|بنتي|تيتة|جدو|جدتي|صاحبي|صاحبتي|صحابي|العيلة|العيله|الشلة|\bmom\b|\bmum\b|\bdad\b|mother|father|sister|brother|\bwife\b|husband|\bson\b|daughter|grandma|grandpa|family|friends?\b/i;

export function parseUnlock(raw: string | null): UnlockState | null {
  if (raw === null) return null;
  try {
    const v = JSON.parse(raw) as Partial<UnlockState>;
    return {
      features: (v.features ?? []).filter((f): f is Feature => ALL_FEATURES.includes(f as Feature)),
      days: (v.days ?? []).filter((d) => typeof d === "string").slice(-7),
    };
  } catch {
    return { features: [], days: [] };
  }
}

/** What a message from the user opens, given what is already open. */
export function featuresFromText(text: string): Feature[] {
  const out: Feature[] = [];
  if (MONEY.test(text)) out.push("daftar");
  if (PEOPLE.test(text)) out.push("people");
  return out;
}

/** Records one user message: its day, and anything it opens. Returns the new state and what is newly open. */
export function afterMessage(state: UnlockState, text: string, localDay: string): { state: UnlockState; opened: Feature[] } {
  const days = state.days.includes(localDay) ? state.days : [...state.days, localDay].slice(-7);
  const wanted = featuresFromText(text);
  if (days.length >= TODAY_AFTER_DAYS) wanted.push("today");
  const opened = wanted.filter((f, i) => !state.features.includes(f) && wanted.indexOf(f) === i);
  return { state: { features: [...state.features, ...opened], days }, opened };
}

/** Opens a feature for something that happened outside the chat (joined a circle, got a Daftar link). */
export function open(state: UnlockState, feature: Feature): { state: UnlockState; opened: Feature[] } {
  if (state.features.includes(feature)) return { state, opened: [] };
  return { state: { ...state, features: [...state.features, feature] }, opened: [feature] };
}

export const localDayOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
