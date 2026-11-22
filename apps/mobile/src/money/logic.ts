import type { MoneySection } from "@fakkarni/shared";

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
