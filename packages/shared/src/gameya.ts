import { z } from "zod";

/**
 * The gam'eya book (2026-11-27, owner ask): a rotating savings circle. Everyone pays the same
 * amount every month and one person takes the whole pot, in turn, until everyone has had theirs.
 * Zaki keeps the record: the turns, who paid this month, who receives, and reminds everyone.
 * Records only: Zaki never holds or moves money (payments go person to person, InstaPay link at most).
 *
 * Rounds count from 1. Round r falls in the month `start_month` + (r - 1) and its pot goes to the
 * member whose turn is r. Every member pays every round, the one receiving too, so the pot is
 * amount × members. Pure: used by the server, the phone and the public page.
 */

export const MIN_GAMEYA_MEMBERS = 2;
export const MAX_GAMEYA_MEMBERS = 30;
export const MAX_GAMEYA_AMOUNT = 1_000_000;
export const MAX_GAMEYAS_PER_OWNER = 20;
export const GAMEYA_NAME_MAX = 60;
export const GAMEYA_MEMBER_NAME_MAX = 40;
/** The pay day is a day of the month every month has. */
export const MAX_PAY_DAY = 28;
/** The organizer's "remind the ones who haven't paid" reaches each person at most this often. */
export const GAMEYA_NUDGE_HOURS = 12;

const MonthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const Instant = z.iso.datetime({ offset: true });

export const GameyaMemberInput = z.object({
  /** Keeps a member's id (and payments) when the organizer reorders before the first payment. */
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(GAMEYA_MEMBER_NAME_MAX),
  /** A Zaki user: only someone in the gam'eya's circle, or the organizer. Others are names only. */
  user_id: z.uuid().nullable().optional(),
});
export type GameyaMemberInput = z.infer<typeof GameyaMemberInput>;

const Members = z.array(GameyaMemberInput).min(MIN_GAMEYA_MEMBERS).max(MAX_GAMEYA_MEMBERS);

export const CreateGameyaRequest = z.object({
  /** Made on the phone, so a resend gives back the same gam'eya. */
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(GAMEYA_NAME_MAX),
  /** Whole pounds each member pays each month. */
  amount: z.number().int().min(1).max(MAX_GAMEYA_AMOUNT),
  pay_day: z.number().int().min(1).max(MAX_PAY_DAY),
  start_month: MonthKey,
  circle_id: z.uuid().nullable().default(null),
  /** In turn order: the first takes the first month's pot. */
  members: Members,
});
export type CreateGameyaRequest = z.infer<typeof CreateGameyaRequest>;

/** Name and pay day change any time; amount, start and members only before the first payment. */
export const UpdateGameyaRequest = z.object({
  name: z.string().trim().min(1).max(GAMEYA_NAME_MAX).optional(),
  pay_day: z.number().int().min(1).max(MAX_PAY_DAY).optional(),
  amount: z.number().int().min(1).max(MAX_GAMEYA_AMOUNT).optional(),
  start_month: MonthKey.optional(),
  members: Members.optional(),
});
export type UpdateGameyaRequest = z.infer<typeof UpdateGameyaRequest>;

export const GameyaPaidRequest = z.object({
  member_id: z.uuid(),
  round: z.number().int().min(1).max(MAX_GAMEYA_MEMBERS),
  paid: z.boolean(),
});
export type GameyaPaidRequest = z.infer<typeof GameyaPaidRequest>;

export const GameyaReceivedRequest = z.object({
  round: z.number().int().min(1).max(MAX_GAMEYA_MEMBERS),
  received: z.boolean(),
});
export type GameyaReceivedRequest = z.infer<typeof GameyaReceivedRequest>;

export const GameyaMember = z.object({
  id: z.string(),
  name: z.string(),
  user_id: z.string().nullable().default(null),
  turn: z.number().int(),
  /** "YYYY-MM": the month this member takes the pot. */
  month: z.string(),
  received: z.boolean().default(false),
  is_me: z.boolean().default(false),
});
export type GameyaMember = z.infer<typeof GameyaMember>;

export const GameyaPayment = z.object({ member_id: z.string(), round: z.number().int() });
export type GameyaPayment = z.infer<typeof GameyaPayment>;

export const Gameya = z.object({
  id: z.string(),
  name: z.string(),
  amount: z.number(),
  currency: z.string().default("EGP"),
  pay_day: z.number().int(),
  start_month: z.string(),
  months: z.number().int(),
  pot: z.number(),
  circle_id: z.string().nullable().default(null),
  circle_name: z.string().nullable().default(null),
  code: z.string(),
  url: z.string(),
  /** The caller is the organizer (keeps the book, ticks anyone, hands over the pot). */
  mine: z.boolean(),
  owner_name: z.string().nullable().default(null),
  /** The organizer's InstaPay link, for members paying in. */
  instapay: z.string().nullable().default(null),
  members: z.array(GameyaMember),
  payments: z.array(GameyaPayment).default([]),
  /** The round of today's month (0 before it starts, months + 1 once it is over). */
  round: z.number().int(),
  created_at: Instant,
});
export type Gameya = z.infer<typeof Gameya>;

export const ListGameyasResponse = z.object({ gameyas: z.array(z.unknown()) });
export const GameyaResponse = z.object({ gameya: Gameya, share_text: z.string().default("") });
export type GameyaResponse = z.infer<typeof GameyaResponse>;
export const GameyaRemindResponse = z.object({ reminded: z.number().int(), share_text: z.string() });
export type GameyaRemindResponse = z.infer<typeof GameyaRemindResponse>;

/** "2026-12" + 2 → "2027-02". */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** Whole months from `a` to `b` ("2026-12" → "2027-02" is 2). */
export function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number) as [number, number];
  const [by, bm] = b.split("-").map(Number) as [number, number];
  return by * 12 + bm - (ay * 12 + am);
}

export const monthOfRound = (start: string, round: number) => addMonths(start, round - 1);

/** The round whose month holds this local date ("YYYY-MM-DD" or "YYYY-MM"). */
export const roundAt = (start: string, localDate: string) => monthsBetween(start, localDate.slice(0, 7)) + 1;

/** "YYYY-MM-DD" of a round's pay day. */
export const payDateOf = (start: string, round: number, payDay: number) => `${monthOfRound(start, round)}-${String(payDay).padStart(2, "0")}`;

type Book = Pick<Gameya, "members" | "payments" | "months" | "amount">;

/** Where one round stands: who receives, who has paid, who still owes. */
export function roundState(g: Book, round: number) {
  const paid = new Set(g.payments.filter((p) => p.round === round).map((p) => p.member_id));
  const receiver = g.members.find((m) => m.turn === round) ?? null;
  const unpaid = g.members.filter((m) => !paid.has(m.id));
  return {
    round,
    receiver,
    paid: g.members.filter((m) => paid.has(m.id)),
    unpaid,
    allPaid: unpaid.length === 0,
    collected: (g.members.length - unpaid.length) * g.amount,
  };
}

export const isPaid = (g: Pick<Gameya, "payments">, memberId: string, round: number) => g.payments.some((p) => p.member_id === memberId && p.round === round);

/** The round to show: today's while it runs, else the first (before) or the last (after). */
export const shownRound = (g: Pick<Gameya, "round" | "months">) => Math.min(Math.max(g.round, 1), g.months);

/** Running, not yet started, or done (every round's month has passed). */
export function phaseOf(g: Pick<Gameya, "round" | "months">): "before" | "running" | "over" {
  if (g.round < 1) return "before";
  return g.round > g.months ? "over" : "running";
}

/**
 * Days from a local date to this round's pay day (negative once it passed). Used for "pay soon"
 * on Today and for the reminder the day before.
 */
export function daysToPayDay(g: Pick<Gameya, "start_month" | "pay_day">, round: number, localDate: string): number {
  const due = Date.parse(`${payDateOf(g.start_month, round, g.pay_day)}T00:00:00Z`);
  const today = Date.parse(`${localDate.slice(0, 10)}T00:00:00Z`);
  return Math.round((due - today) / 86_400_000);
}

/** The caller's own member row (a gam'eya can hold the same person once as a Zaki user). */
export const myMember = (g: Pick<Gameya, "members">) => g.members.find((m) => m.is_me) ?? null;

/** Fisher-Yates with an injected random source, for the "draw the turns" button. */
export function shuffled<T>(list: readonly T[], random: () => number = Math.random): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
