import { DEFAULT_SERVICE_PCT, DEFAULT_VAT_PCT, splitBill, type SplitInput } from "@fakkarni/shared";
import { parseAmount } from "../daftar/logic";

/** One item as typed: name, price text, and who had it (none = everyone). */
export interface DraftItem {
  name: string;
  price: string;
  eaters: number[];
}

/** The split form as typed (text fields, so half-typed numbers are fine). */
export interface Draft {
  title: string;
  /** The bill before service, if known: whatever the items don't cover is shared by everyone. */
  subtotal: string;
  people: string[];
  items: DraftItem[];
  service: boolean;
  vat: boolean;
  tip: string;
  paidBy: number | null;
}

/** Starting rows: "me" first, then empty rows up to `count` (at least 2). */
export function startPeople(me: string, count: number | null): string[] {
  const n = Math.min(Math.max(count ?? 2, 2), 30);
  return Array.from({ length: n }, (_, i) => (i === 0 ? me : ""));
}

/** The request for the server, or null while something needed is missing. Pure. */
export function toSplitInput(d: Draft): SplitInput | null {
  if (d.people.length < 2 || d.people.some((p) => !p.trim())) return null;
  const items: SplitInput["items"] = [];
  for (const it of d.items) {
    const price = parseAmount(it.price);
    if (!it.name.trim() && !it.price.trim()) continue; // an empty row is ignored
    if (!it.name.trim() || price === null) return null;
    items.push({ name: it.name.trim(), price, eaters: it.eaters.filter((e) => e < d.people.length) });
  }
  const subtotal = d.subtotal.trim() ? parseAmount(d.subtotal) : null;
  if (d.subtotal.trim() && subtotal === null) return null;
  if (!items.length && subtotal === null) return null;
  return {
    title: d.title.trim(),
    people: d.people.map((name) => ({ name: name.trim() })),
    items,
    subtotal,
    service_pct: d.service ? DEFAULT_SERVICE_PCT : 0,
    vat_pct: d.vat ? DEFAULT_VAT_PCT : 0,
    vat_on_service: true,
    tip: parseAmount(d.tip) ?? 0,
    paid_by: d.paidBy !== null && d.paidBy < d.people.length ? d.paidBy : null,
  };
}

/** The live preview while typing (the server does the same math when it is sent). */
export function previewSplit(d: Draft) {
  const input = toSplitInput(d);
  return input ? { input, ...splitBill(input) } : null;
}

/** Remove a person and fix every index that pointed past them. */
export function removePerson(d: Draft, index: number): Draft {
  const shift = (i: number) => (i > index ? i - 1 : i);
  return {
    ...d,
    people: d.people.filter((_, k) => k !== index),
    items: d.items.map((it) => ({ ...it, eaters: it.eaters.filter((e) => e !== index).map(shift) })),
    paidBy: d.paidBy === index ? null : d.paidBy === null ? null : shift(d.paidBy),
  };
}
