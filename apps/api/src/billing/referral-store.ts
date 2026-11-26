import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { extendBonus, monthStart, REFERRAL_WELCOME_DAYS, referralDaysToGrant } from "./referral";

const REWARD_EVENT = "referral_reward";
const WELCOME_EVENT = "referral_welcome";
type Db = PrismaClient | Prisma.TransactionClient;

/** Pro days this inviter earned in the current calendar month. */
export async function referralDaysThisMonth(db: Db, userId: string, now: Date): Promise<number> {
  const rows = await db.event.findMany({ where: { userId, name: REWARD_EVENT, createdAt: { gte: monthStart(now) } }, select: { propsJson: true } });
  return rows.reduce((sum, r) => sum + (Number((r.propsJson as { days?: number }).days) || 0), 0);
}

/**
 * Record who invited `inviteeId`, give the inviter their Pro days and the invitee their welcome days. Returns false when
 * the invitee already has an inviter (a double tap, or a second invite). Call inside a
 * transaction, after `canClaim` said yes. Once the transaction is committed, the caller drops
 * the inviter's saved row (`forgetCachedUserId`, plugins/auth.ts): their Pro days changed
 * behind their back.
 */
export async function rewardInviter(tx: Prisma.TransactionClient, inviteeId: string, inviterId: string, now: Date): Promise<boolean> {
  // Only the first claim sets referred_by_id.
  const claimed = await tx.user.updateMany({ where: { id: inviteeId, referredById: null }, data: { referredById: inviterId, referralRewardedAt: now } });
  if (claimed.count === 0) return false;
  const inviter = await tx.user.findUniqueOrThrow({ where: { id: inviterId } });
  const days = referralDaysToGrant(await referralDaysThisMonth(tx, inviter.id, now));
  if (days > 0) await tx.user.update({ where: { id: inviter.id }, data: { bonusProUntil: extendBonus(inviter.bonusProUntil, now, days) } });
  // Recorded even at 0 days, so the inviter still sees the friend joined.
  await tx.event.create({ data: { userId: inviter.id, name: REWARD_EVENT, propsJson: { days }, createdAt: now } });
  // Both sides win: the friend gets their own Pro days (no monthly cap: one inviter per user).
  const invitee = await tx.user.findUniqueOrThrow({ where: { id: inviteeId } });
  await tx.user.update({ where: { id: inviteeId }, data: { bonusProUntil: extendBonus(invitee.bonusProUntil, now, REFERRAL_WELCOME_DAYS) } });
  await tx.event.create({ data: { userId: inviteeId, name: WELCOME_EVENT, propsJson: { days: REFERRAL_WELCOME_DAYS }, createdAt: now } });
  return true;
}
