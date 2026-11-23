import { z } from "zod";

/**
 * Split the check (owner ask, 2026-11-23): each person pays for what they ordered, shared plates
 * are split among whoever had them, and Egypt's 12% service and 14% VAT follow each person's
 * part (whoever ordered more pays more of them). Friends add their own items on the public page,
 * no install needed: that is how the people at the table meet Zaki. Free, no AI, text only.
 * Records only: Zaki never holds or moves money. (Not named after any other app.)
 */
const Instant = z.iso.datetime({ offset: true });

/** Egyptian restaurants: 12% service, then 14% VAT (usually on the bill plus service). */
export const DEFAULT_SERVICE_PCT = 12;
export const DEFAULT_VAT_PCT = 14;
export const MAX_SPLIT_PEOPLE = 30;
export const MAX_SPLIT_ITEMS = 100;

export const SplitPersonInput = z.object({ name: z.string().trim().min(1).max(40) });
export type SplitPersonInput = z.infer<typeof SplitPersonInput>;

export const SplitItem = z.object({
  name: z.string().trim().min(1).max(60),
  /** The line's price before service and VAT (quantity already included). */
  price: z.number().positive().max(1_000_000),
  /** Indexes in `people` who had it; empty = everyone shares it. */
  eaters: z.array(z.number().int().min(0)).max(MAX_SPLIT_PEOPLE).default([]),
});
export type SplitItem = z.infer<typeof SplitItem>;

export const SplitInput = z.object({
  title: z.string().trim().max(60).default(""),
  people: z.array(SplitPersonInput).min(2).max(MAX_SPLIT_PEOPLE),
  items: z.array(SplitItem).max(MAX_SPLIT_ITEMS).default([]),
  /**
   * The bill before service and VAT, as typed. Whatever the items don't cover is shared by
   * everyone, so a bill can start as a quick even split and friends claim their items later.
   * Null: the bill is just the items.
   */
  subtotal: z.number().positive().max(10_000_000).nullable().default(null),
  service_pct: z.number().min(0).max(30).default(DEFAULT_SERVICE_PCT),
  vat_pct: z.number().min(0).max(30).default(DEFAULT_VAT_PCT),
  /** Egyptian receipts usually charge VAT on the bill plus service. */
  vat_on_service: z.boolean().default(true),
  /** A tip on top, split evenly. */
  tip: z.number().min(0).max(1_000_000).default(0),
  /** Index in `people` of who paid the bill (everyone else owes them their share). */
  paid_by: z.number().int().min(0).nullable().default(null),
});
export type SplitInput = z.infer<typeof SplitInput>;

export type SplitMath = Pick<SplitInput, "people" | "items" | "subtotal" | "service_pct" | "vat_pct" | "vat_on_service" | "tip">;

export interface SplitResult {
  /** The bill before service and VAT: the items plus the shared rest. */
  subtotal: number;
  service: number;
  vat: number;
  /** Everything, rounded to whole pounds. */
  total: number;
  /** What each person ordered, before service and VAT (unrounded). */
  ordered: number[];
  /** Each person's share in whole pounds, in the order given; they add up to `total`. */
  shares: number[];
}

/** Who had an item: its eaters that exist, or everyone when none are named. */
const eatersOf = (item: SplitItem, n: number) => {
  const valid = [...new Set(item.eaters.filter((i) => i >= 0 && i < n))];
  return valid.length ? valid : Array.from({ length: n }, (_, i) => i);
};

/**
 * The shares: each person's items (shared plates split among who had them), plus service and
 * VAT in proportion, plus an even part of the tip. Rounded to whole pounds with the largest
 * remainders taking the extra pound, so the shares always add up to the total.
 */
export function splitBill(input: SplitMath): SplitResult {
  const n = input.people.length;
  const ordered = Array.from({ length: n }, () => 0);
  for (const item of input.items) {
    const who = eatersOf(item, n);
    for (const i of who) ordered[i]! += item.price / who.length;
  }
  // The part of the typed bill no item covers is shared by everyone.
  const rest = Math.max(0, (input.subtotal ?? 0) - input.items.reduce((a, it) => a + it.price, 0));
  for (let i = 0; i < n; i++) ordered[i]! += rest / n;
  const svc = input.service_pct / 100;
  const vatRate = input.vat_pct / 100;
  const exact = ordered.map((o) => {
    const service = o * svc;
    return o + service + (input.vat_on_service ? o + service : o) * vatRate + (n ? input.tip / n : 0);
  });
  const subtotal = ordered.reduce((a, b) => a + b, 0);
  const service = subtotal * svc;
  const vat = (input.vat_on_service ? subtotal + service : subtotal) * vatRate;
  const total = Math.round(exact.reduce((a, b) => a + b, 0));
  const floors = exact.map(Math.floor);
  let left = total - floors.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => ({ i, r: e - Math.floor(e) })).sort((a, b) => b.r - a.r || a.i - b.i);
  const shares = [...floors];
  for (let k = 0; left > 0 && n > 0; k = (k + 1) % n, left--) shares[order[k]!.i]! += 1;
  for (let k = n - 1; left < 0 && n > 0; k = (k - 1 + n) % n, left++) shares[order[k]!.i]! -= 1;
  return { subtotal, service: Math.round(service), vat: Math.round(vat), total, ordered, shares };
}

/** Pull "احسبلي 1850 على 5" / "split 900 between 4" out of a chat message. */
export function parseSplitAsk(text: string): { subtotal: number | null; people: number | null } | null {
  if (!/احسبلي|إحسبلي|احسب لي|نقسم الحساب|اقسم الحساب|قسّم الحساب|قسم الحساب|نقسّم|split (the )?(bill|check)|split \d/i.test(text)) return null;
  const digits = text.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/(\d),(\d{3})/g, "$1$2");
  const subtotal = /(\d+(?:\.\d+)?)/.exec(digits)?.[1];
  const people = /(?:على|بين|علي|between|for|by)\s*(\d{1,2})\b/i.exec(digits)?.[1];
  return { subtotal: subtotal ? Number(subtotal) : null, people: people ? Number(people) : null };
}

export const SplitPerson = z.object({
  name: z.string(),
  /** What they ordered, before service and VAT. */
  ordered: z.number(),
  share: z.number(),
  paid: z.boolean(),
});
export type SplitPerson = z.infer<typeof SplitPerson>;

export const Split = z.object({
  id: z.string(),
  code: z.string(),
  title: z.string(),
  currency: z.string(),
  subtotal: z.number(),
  service_pct: z.number(),
  vat_pct: z.number(),
  vat_on_service: z.boolean(),
  tip: z.number(),
  total: z.number(),
  people: z.array(SplitPerson),
  items: z.array(SplitItem.extend({ eaters: z.array(z.number()) })),
  /** The bill as typed (before service), or null when it is just the items. */
  bill: z.number().nullable(),
  /** Items friends added from the public page. */
  web_adds: z.number(),
  paid_by: z.number().nullable(),
  /** The public page everyone at the table opens. */
  url: z.string(),
  created_at: Instant,
});
export type Split = z.infer<typeof Split>;

export const SplitResponse = z.object({
  split: Split,
  /** Ready WhatsApp message: everyone's share and the link. */
  share_text: z.string(),
});
export type SplitResponse = z.infer<typeof SplitResponse>;

export const ListSplitsResponse = z.object({ splits: z.array(Split) });
export type ListSplitsResponse = z.infer<typeof ListSplitsResponse>;

/** The creator changes the people or items after sending (the shares are worked out again). */
export const UpdateSplitRequest = SplitInput.pick({ people: true, items: true, subtotal: true, service_pct: true, vat_pct: true, vat_on_service: true, tip: true, paid_by: true });
export type UpdateSplitRequest = z.infer<typeof UpdateSplitRequest>;

export const MarkSplitPaidRequest = z.object({ index: z.number().int().min(0), paid: z.boolean() });
export type MarkSplitPaidRequest = z.infer<typeof MarkSplitPaidRequest>;
