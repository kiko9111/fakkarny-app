import { addMonths, MAX_GAMEYA_AMOUNT, MAX_GAMEYA_MEMBERS, MIN_GAMEYA_MEMBERS, phaseOf, roundState, shownRound, type CreateGameyaRequest, type Gameya } from "@fakkarni/shared";

/**
 * The gam'eya screens' logic, pure (the words and the locale come in). The book itself lives on
 * the server; this is the form and how a book is summed up in a row.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** The phone's local date, "YYYY-MM-DD". */
export const localDay = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

/** "2027-02" in the reader's language ("February 2027" / "فبراير 2027"). */
export function monthLabel(month: string, locale: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(y, m - 1, 15).toLocaleDateString(locale, { month: "long", year: "numeric" });
}

/** This month and the next two: the months a new gam'eya can start in. */
export const startChoices = (today: string) => [0, 1, 2].map((n) => addMonths(today.slice(0, 7), n));

export interface GameyaDraft {
  name: string;
  amount: string;
  payDay: number;
  start: string;
  circleId: string | null;
  /** In turn order. `userId` only for circle members and the organizer. */
  people: { name: string; userId: string | null }[];
}

export function newDraft(today: string, me: { name: string; userId: string | null }): GameyaDraft {
  return { name: "", amount: "", payDay: 1, start: startChoices(today)[1]!, circleId: null, people: [me, { name: "", userId: null }, { name: "", userId: null }] };
}

/** Reads "1,500" / "١٥٠٠" as whole pounds. */
export function wholePounds(raw: string): number | null {
  const n = Number(raw.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[٬,\s]/g, ""));
  return Number.isInteger(n) && n >= 1 && n <= MAX_GAMEYA_AMOUNT ? n : null;
}

/** The request, or null while something is missing (a name, the amount, two people). */
export function draftRequest(d: GameyaDraft, id: string): CreateGameyaRequest | null {
  const amount = wholePounds(d.amount);
  const people = d.people.map((p) => ({ name: p.name.trim().slice(0, 40), user_id: p.userId })).filter((p) => p.name);
  if (!d.name.trim() || amount === null || people.length < MIN_GAMEYA_MEMBERS || people.length > MAX_GAMEYA_MEMBERS) return null;
  return { id, name: d.name.trim().slice(0, 60), amount, pay_day: d.payDay, start_month: d.start, circle_id: d.circleId, members: people };
}

/** The circle's members as the turns (the organizer first), keeping names typed by hand after them. */
export function withCircle(d: GameyaDraft, circle: { id: string; members: { user_id: string; name: string | null }[] } | null, me: { name: string; userId: string | null }, unnamed: (n: number) => string): GameyaDraft {
  const typed = d.people.filter((p) => !p.userId && p.name.trim() && p.name.trim() !== me.name);
  if (!circle) return { ...d, circleId: null, people: [me, ...typed, ...(typed.length ? [] : [{ name: "", userId: null }])] };
  const others = circle.members.filter((m) => m.user_id !== me.userId).map((m, i) => ({ name: m.name?.trim() || unnamed(i + 2), userId: m.user_id }));
  return { ...d, circleId: circle.id, people: [me, ...others, ...typed].slice(0, MAX_GAMEYA_MEMBERS) };
}

/** Move one person up or down the turns. */
export function moveTurn<T>(list: readonly T[], from: number, by: -1 | 1): T[] {
  const to = from + by;
  if (to < 0 || to >= list.length) return [...list];
  const out = [...list];
  [out[from], out[to]] = [out[to]!, out[from]!];
  return out;
}

/** A row's one line: where the book stands this month. */
export function gameyaLine(g: Gameya, words: { rowRunning: string; startsIn: string; over: string }, locale: string): string {
  const phase = phaseOf(g);
  if (phase === "before") return words.startsIn.replace("{month}", monthLabel(g.start_month, locale));
  if (phase === "over") return words.over;
  const s = roundState(g, shownRound(g));
  return words.rowRunning.replace("{month}", monthLabel(addMonths(g.start_month, g.round - 1), locale)).replace("{name}", s.receiver?.name ?? "—");
}
