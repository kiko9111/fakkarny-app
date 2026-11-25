import { z } from "zod";

/**
 * Wider Daftar (expenses and income). Sections start empty: the user makes them ("Car",
 * "Groceries", "Salary"), each with an optional monthly budget Zaki warns about. A section can
 * be a circle's shared book: members add what they paid and see who owes whom (split evenly
 * among the people picked). Records only: Zaki never holds or moves money. Wire shapes, snake_case.
 */
const Instant = z.iso.datetime({ offset: true });
export const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const MoneyKind = z.enum(["expense", "income"]);
export type MoneyKind = z.infer<typeof MoneyKind>;

/** Budget warnings: at this share of the monthly budget, then at 100%. */
export const BUDGET_WARN_AT = 0.8;
/** A section a user may keep: generous abuse guard, not a product cap. */
export const MAX_SECTIONS = 60;

export const MoneySection = z.object({
  id: z.string(),
  name: z.string(),
  kind: MoneyKind,
  budget: z.number().nullable(),
  circle_id: z.string().nullable(),
  circle_name: z.string().nullable(),
  is_owner: z.boolean(),
  /** Sum of this month's entries (the whole book for a shared one). */
  month_total: z.number(),
  /** The caller's own share of this month's entries in a shared book; equals month_total otherwise. */
  my_share: z.number(),
  created_at: Instant,
});
export type MoneySection = z.infer<typeof MoneySection>;

export const MoneyEntry = z.object({
  id: z.string(),
  section_id: z.string(),
  amount: z.number(),
  note: z.string().nullable(),
  at: Instant,
  payer_name: z.string().nullable(),
  is_mine: z.boolean(),
  /** How many people share it (shared books); 1 for a personal section. */
  split_count: z.number().int().positive(),
});
export type MoneyEntry = z.infer<typeof MoneyEntry>;

/** One "X pays Y" line that settles a shared book (fewest transfers). */
export const Settlement = z.object({ from_name: z.string().nullable(), to_name: z.string().nullable(), amount: z.number(), from_me: z.boolean(), to_me: z.boolean() });
export type Settlement = z.infer<typeof Settlement>;

export const MoneyOverview = z.object({
  month: Month,
  sections: z.array(MoneySection),
  totals: z.object({ expense: z.number(), income: z.number() }),
});
export type MoneyOverview = z.infer<typeof MoneyOverview>;

export const SectionDetail = z.object({
  section: MoneySection,
  entries: z.array(MoneyEntry),
  /** Shared books only: who pays whom to be even (all time). */
  settle: z.array(Settlement),
  members: z.array(z.object({ user_id: z.string(), name: z.string().nullable(), is_me: z.boolean() })),
});
export type SectionDetail = z.infer<typeof SectionDetail>;

export const CreateSectionRequest = z.object({
  /** Made on the phone, so the section shows at once and a retried create is not a second one. */
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(40),
  kind: MoneyKind.default("expense"),
  budget: z.number().positive().max(100_000_000).nullable().optional(),
  circle_id: z.uuid().nullable().optional(),
});
export type CreateSectionRequest = z.infer<typeof CreateSectionRequest>;

export const UpdateSectionRequest = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  budget: z.number().positive().max(100_000_000).nullable().optional(),
});
export type UpdateSectionRequest = z.infer<typeof UpdateSectionRequest>;

export const AddMoneyEntryRequest = z.object({
  /** Made on the phone, so the entry shows at once and a retried add is not counted twice. */
  id: z.uuid().optional(),
  amount: z.number().positive().max(100_000_000),
  note: z.string().trim().max(80).nullable().optional(),
  /** Shared books: who shares this one (user ids, payer included or not). Default: every member. */
  split: z.array(z.uuid()).min(1).max(50).optional(),
});
export type AddMoneyEntryRequest = z.infer<typeof AddMoneyEntryRequest>;

export const SectionResponse = z.object({ section: MoneySection, entry: MoneyEntry.optional() });
export type SectionResponse = z.infer<typeof SectionResponse>;

/** Zaki's end-of-month "gift": a few warm template lines about the month that ended. */
export const MonthGift = z.object({ month: Month, lines: z.array(z.string()), expense: z.number(), income: z.number() });
export type MonthGift = z.infer<typeof MonthGift>;

/**
 * Two sections are the same when their names match ignoring case, extra spaces, Arabic
 * diacritics and letter variants (أ/إ/آ = ا, ة = ه, ى = ي): "salary" = "Salary ". The server
 * returns the existing section instead of making a second one, and merges old duplicates.
 */
export function sectionKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ");
}
