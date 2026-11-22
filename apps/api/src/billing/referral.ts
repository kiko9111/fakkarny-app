import { randomInt } from "node:crypto";

/**
 * Invite rewards (owner decision, 2026-11-22): each friend who joins gives the inviter
 * 7 days of Pro, up to 4 weeks a calendar month. Pure helpers; the routes do the storage.
 */
export const REFERRAL_DAYS_PER_FRIEND = 7;
export const REFERRAL_MAX_DAYS_PER_MONTH = 28;
/** A new user can name their inviter only during their first week. */
export const REFERRAL_CLAIM_WINDOW_DAYS = 7;

// No 0/O, 1/I/L: codes get read out loud and typed from a WhatsApp message.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newReferralCode(length = 7): string {
  let code = "";
  for (let i = 0; i < length; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

export const normalizeReferralCode = (raw: string) => raw.trim().toUpperCase();

/** Days to grant now, given what the inviter already earned this calendar month. */
export function referralDaysToGrant(daysThisMonth: number): number {
  return Math.max(0, Math.min(REFERRAL_DAYS_PER_FRIEND, REFERRAL_MAX_DAYS_PER_MONTH - daysThisMonth));
}

/** Bonus days stack on top of whatever bonus is still running. */
export function extendBonus(current: Date | null, now: Date, days: number): Date {
  const from = current && current > now ? current : now;
  return new Date(from.getTime() + days * 86_400_000);
}

export type ClaimRefusal = "sign_in_required" | "own_code" | "already_claimed" | "too_late" | "unknown_code";

export function canClaim(
  invitee: { id: string; authId: string; referredById: string | null; createdAt: Date },
  inviter: { id: string } | null,
  now: Date,
): { ok: true } | { ok: false; reason: ClaimRefusal } {
  // Install-ID accounts are free to create, so only signed-in friends earn a reward.
  if (!invitee.authId.startsWith("supabase:")) return { ok: false, reason: "sign_in_required" };
  if (invitee.referredById) return { ok: false, reason: "already_claimed" };
  if (!inviter) return { ok: false, reason: "unknown_code" };
  if (inviter.id === invitee.id) return { ok: false, reason: "own_code" };
  if (now.getTime() - invitee.createdAt.getTime() > REFERRAL_CLAIM_WINDOW_DAYS * 86_400_000) return { ok: false, reason: "too_late" };
  return { ok: true };
}

/** First instant of the calendar month (UTC) that `now` falls in. */
export const monthStart = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
