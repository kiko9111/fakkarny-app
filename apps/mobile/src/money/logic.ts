import { sectionKey, type MoneyEntry, type MoneyOverview, type MoneySection, type SectionDetail } from "@fakkarni/shared";

/** Pure helpers for the spending screens (unit-tested; no react-native imports). */

/** 0..1 of the monthly budget (your share in a shared book), and whether it went over. */
export function budgetState(s: Pick<MoneySection, "budget" | "month_total" | "my_share" | "circle_id">): { value: number; over: boolean; near: boolean } | null {
  if (!s.budget) return null;
  const used = s.month_total;
  return { value: Math.min(1, used / s.budget), over: used > s.budget, near: used >= s.budget * 0.8 };
}

/** "2026-11" → "نوفمبر 2026" / "November 2026" in the phone's locale. */
export function monthLabel(month: string, locale: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(y, m - 1, 15).toLocaleDateString(locale, { month: "long", year: "numeric" });
}

/** Personal sections first (spending, then income), shared books after. */
export function groupSections<T extends Pick<MoneySection, "circle_id" | "kind" | "created_at">>(sections: readonly T[]): { own: T[]; shared: T[] } {
  const own = sections.filter((s) => !s.circle_id).sort((a, b) => (a.kind === b.kind ? a.created_at.localeCompare(b.created_at) : a.kind === "expense" ? -1 : 1));
  return { own, shared: sections.filter((s) => s.circle_id) };
}

/** Tap a member in or out of a split; never leaves it empty. */
export function toggleSplit(split: readonly string[], id: string): string[] {
  if (!split.includes(id)) return [...split, id];
  return split.length > 1 ? split.filter((x) => x !== id) : [...split];
}

// Local-first: the phone shows a change at once and the server catches up (ids made here).

/** A section the user already has with this name and kind ("Salary" = "salary"). */
export function sameSection<T extends Pick<MoneySection, "name" | "kind" | "circle_id" | "is_owner">>(sections: readonly T[], name: string, kind: MoneySection["kind"], circleId: string | null): T | null {
  const key = sectionKey(name);
  return sections.find((s) => (s.circle_id ?? null) === circleId && s.kind === kind && sectionKey(s.name) === key && (circleId !== null || s.is_owner)) ?? null;
}

/** The section as it will look right after creating it (no entries yet). */
export function draftSection(input: { id: string; name: string; kind: MoneySection["kind"]; budget: number | null; circle_id: string | null; circle_name: string | null }, now: Date): MoneySection {
  return { ...input, name: input.name.trim(), is_owner: true, month_total: 0, my_share: 0, created_at: now.toISOString() };
}

/** The overview with one section added or replaced, totals recounted. */
export function withSection(o: MoneyOverview, s: MoneySection): MoneyOverview {
  const sections = o.sections.some((x) => x.id === s.id) ? o.sections.map((x) => (x.id === s.id ? s : x)) : [...o.sections, s];
  return { ...o, sections, totals: totalsOf(sections) };
}

/** The overview without a section. */
export function withoutSection(o: MoneyOverview, id: string): MoneyOverview {
  const sections = o.sections.filter((x) => x.id !== id);
  return { ...o, sections, totals: totalsOf(sections) };
}

function totalsOf(sections: readonly MoneySection[]): MoneyOverview["totals"] {
  const sum = (kind: MoneySection["kind"]) => round2(sections.filter((s) => s.kind === kind).reduce((n, s) => n + s.my_share, 0));
  return { expense: sum("expense"), income: sum("income") };
}

/** An entry the user just typed, before the server has it. In a shared book `share` is their part. */
export function draftEntry(input: { id: string; section_id: string; amount: number; note: string | null; split_count: number }, now: Date): MoneyEntry {
  return { ...input, at: now.toISOString(), payer_name: null, is_mine: true, split_count: Math.max(1, input.split_count) };
}

/**
 * The section screen with an entry added (or taken out with `sign` -1): newest first, the month
 * total and the user's own share moved by the amount (their even part in a shared book).
 */
export function withEntry(d: SectionDetail, e: MoneyEntry, sign: 1 | -1 = 1): SectionDetail {
  const has = d.entries.some((x) => x.id === e.id);
  if (sign === 1 && has) return d;
  if (sign === -1 && !has) return d;
  const entries = sign === 1 ? [e, ...d.entries] : d.entries.filter((x) => x.id !== e.id);
  const shared = Boolean(d.section.circle_id);
  const mine = shared ? (e.is_mine ? e.amount / Math.max(1, e.split_count) : 0) : e.amount;
  const section = { ...d.section, month_total: round2(d.section.month_total + sign * e.amount), my_share: round2(d.section.my_share + sign * mine) };
  return { ...d, section, entries };
}

/** A first look at a section the list already knows, while its entries load. */
export function detailFromSection(s: MoneySection): SectionDetail {
  return { section: s, entries: [], settle: [], members: [] };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A write waiting on the phone (see sync/writes.ts), as far as these screens care. */
export interface WaitingWrite {
  method: string;
  path: string;
  body?: unknown;
  at: string;
}

const SECTIONS_PATH = "/money/sections";
const entryPath = /^\/money\/sections\/([\w-]+)\/entries$/;
const entryDelete = /^\/money\/entries\/([\w-]+)$/;
const sectionDelete = /^\/money\/sections\/([\w-]+)$/;
type Body = { id?: string; name?: string; kind?: MoneySection["kind"]; budget?: number | null; circle_id?: string | null; amount?: number; note?: string | null; split?: string[] };

/**
 * A fresh overview from the server plus what still waits on the phone (sections made and
 * amounts added offline), so nothing the user did disappears while the write is on its way.
 */
export function overlayOverview(o: MoneyOverview, waiting: readonly WaitingWrite[]): MoneyOverview {
  let out = o;
  for (const w of waiting) {
    const b = (w.body ?? {}) as Body;
    if (w.method === "POST" && w.path === SECTIONS_PATH && b.id && b.name && !out.sections.some((s) => s.id === b.id)) {
      out = withSection(out, draftSection({ id: b.id, name: b.name, kind: b.kind ?? "expense", budget: b.budget ?? null, circle_id: b.circle_id ?? null, circle_name: null }, new Date(w.at)));
    }
    const m = w.method === "POST" ? entryPath.exec(w.path) : null;
    const s = m ? out.sections.find((x) => x.id === m[1]) : undefined;
    if (s && b.amount) {
      const share = s.circle_id ? b.amount / Math.max(1, b.split?.length ?? 1) : b.amount;
      out = withSection(out, { ...s, month_total: round2(s.month_total + b.amount), my_share: round2(s.my_share + share) });
    }
    const gone = w.method === "DELETE" ? sectionDelete.exec(w.path) : null;
    if (gone) out = withoutSection(out, gone[1]!);
  }
  return out;
}

/** A fresh section screen plus amounts added or removed on the phone that the server hasn't got yet. */
export function overlayDetail(d: SectionDetail, waiting: readonly WaitingWrite[]): SectionDetail {
  let out = d;
  for (const w of waiting) {
    const b = (w.body ?? {}) as Body;
    const m = w.method === "POST" ? entryPath.exec(w.path) : null;
    if (m && m[1] === d.section.id && b.id && b.amount) {
      out = withEntry(out, draftEntry({ id: b.id, section_id: d.section.id, amount: b.amount, note: b.note ?? null, split_count: b.split?.length ?? (out.members.length || 1) }, new Date(w.at)));
    }
    const del = w.method === "DELETE" ? entryDelete.exec(w.path) : null;
    const e = del ? out.entries.find((x) => x.id === del[1]) : undefined;
    if (e) out = withEntry(out, e, -1);
  }
  return out;
}
