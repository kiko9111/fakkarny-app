import { z } from "zod";
import { DebtDirection } from "./enums";

/**
 * Shared Daftar (Zaki M4): a debt between two people that both can see. Records only:
 * Zaki never holds or moves money. Wire shapes, snake_case.
 */
const Instant = z.iso.datetime({ offset: true });

export const DaftarStatus = z.enum(["pending", "confirmed", "disputed", "settled", "cancelled"]);
export type DaftarStatus = z.infer<typeof DaftarStatus>;

export const DaftarEntry = z.object({
  id: z.string(),
  /** The other person's name, as the caller should see it. */
  other_name: z.string(),
  /** From the caller's side: owed_to_me = the other person owes the caller. */
  direction: DebtDirection,
  amount: z.number().positive(),
  currency: z.string(),
  note: z.string().nullable(),
  status: DaftarStatus,
  /** True when the caller wrote the entry (they can cancel it and re-send the link). */
  mine: z.boolean(),
  /** The confirm link, for the creator to send. Null for the other person. */
  url: z.string().nullable(),
  /** The InstaPay link of whoever is owed, when the caller is the one who owes and it is known. */
  pay_link: z.string().nullable(),
  circle_id: z.string().nullable(),
  created_at: Instant,
  responded_at: Instant.nullable(),
  settled_at: Instant.nullable(),
});
export type DaftarEntry = z.infer<typeof DaftarEntry>;

export const CreateDaftarRequest = z.object({
  other_name: z.string().trim().min(1).max(40),
  direction: DebtDirection,
  amount: z.number().positive().max(100_000_000),
  note: z.string().trim().max(120).optional(),
  circle_id: z.uuid().optional(),
  /** A member of that circle: the entry goes straight to their app, no link needed. */
  other_user_id: z.uuid().optional(),
});
export type CreateDaftarRequest = z.infer<typeof CreateDaftarRequest>;

export const DaftarResponse = z.object({
  entry: DaftarEntry,
  /** Ready WhatsApp message for the creator to send (confirm link, or a kind nudge). */
  share_text: z.string().nullable(),
});
export type DaftarResponse = z.infer<typeof DaftarResponse>;

export const ListDaftarResponse = z.object({ entries: z.array(DaftarEntry) });
export type ListDaftarResponse = z.infer<typeof ListDaftarResponse>;

export const RespondDaftarRequest = z.object({ answer: z.enum(["confirm", "dispute"]) });
export type RespondDaftarRequest = z.infer<typeof RespondDaftarRequest>;

/** An InstaPay payment link, as the InstaPay app shares it. Anything else is refused. */
export function parseInstapayLink(raw: string): string | null {
  const text = raw.trim();
  const m = /https:\/\/ipn\.eg\/[A-Za-z0-9._~\-/%]+/.exec(text);
  if (!m) return null;
  try {
    const url = new URL(m[0]);
    return url.hostname === "ipn.eg" && url.pathname.length > 1 ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Totals for the Money tab, counting entries both sides agree on plus those still waiting. */
export function daftarTotals(entries: Pick<DaftarEntry, "direction" | "amount" | "status">[]): { owedToMe: number; iOwe: number } {
  let owedToMe = 0;
  let iOwe = 0;
  for (const e of entries) {
    if (e.status !== "pending" && e.status !== "confirmed") continue;
    if (e.direction === "owed_to_me") owedToMe += e.amount;
    else iOwe += e.amount;
  }
  return { owedToMe, iOwe };
}
