import type { FastifyPluginAsync, preHandlerAsyncHookHandler } from "fastify";
import { ClaimReferralRequest, type MeResponse, type ReferralResponse } from "@fakkarni/shared";
import { Prisma, type PrismaClient } from "../generated/prisma/client";
import {
  canClaim,
  extendBonus,
  monthStart,
  newReferralCode,
  normalizeReferralCode,
  REFERRAL_MAX_DAYS_PER_MONTH,
  referralDaysToGrant,
} from "../billing/referral";
import { toWireUser } from "../serialize";

export interface ReferralRoutesOptions {
  prisma: PrismaClient;
  authenticate: preHandlerAsyncHookHandler;
  now?: () => Date;
}

const REWARD_EVENT = "referral_reward";

async function daysThisMonth(prisma: PrismaClient | Prisma.TransactionClient, userId: string, now: Date): Promise<number> {
  const rows = await prisma.event.findMany({ where: { userId, name: REWARD_EVENT, createdAt: { gte: monthStart(now) } }, select: { propsJson: true } });
  return rows.reduce((sum, r) => sum + (Number((r.propsJson as { days?: number }).days) || 0), 0);
}

/** The user's code, created on first use (retry on the rare collision). */
async function ensureCode(prisma: PrismaClient, user: { id: string; referralCode: string | null }): Promise<string> {
  if (user.referralCode) return user.referralCode;
  for (let attempt = 0; ; attempt++) {
    try {
      const updated = await prisma.user.update({ where: { id: user.id }, data: { referralCode: newReferralCode() } });
      return updated.referralCode!;
    } catch (err) {
      if (attempt < 4 && err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
}

export const referralRoutes: FastifyPluginAsync<ReferralRoutesOptions> = async (app, opts) => {
  const { prisma } = opts;
  const now = opts.now ?? (() => new Date());
  app.addHook("preHandler", opts.authenticate);

  app.get("/me/referral", async (req) => {
    const res: ReferralResponse = {
      code: await ensureCode(prisma, req.user),
      days_this_month: await daysThisMonth(prisma, req.user.id, now()),
      max_days_per_month: REFERRAL_MAX_DAYS_PER_MONTH,
    };
    return res;
  });

  /** A new, signed-in user names who invited them: the inviter earns Pro days. */
  app.post("/referrals/claim", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const body = ClaimReferralRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    const at = now();
    const inviter = await prisma.user.findUnique({ where: { referralCode: normalizeReferralCode(body.data.code) } });
    const check = canClaim(req.user, inviter, at);
    if (!check.ok) return reply.code(check.reason === "unknown_code" ? 404 : 409).send({ error: check.reason });

    const user = await prisma.$transaction(async (tx) => {
      // Guard against a double tap: only the first claim sets referred_by_id.
      const claimed = await tx.user.updateMany({ where: { id: req.user.id, referredById: null }, data: { referredById: inviter!.id, referralRewardedAt: at } });
      if (claimed.count === 0) return null;
      const fresh = await tx.user.findUniqueOrThrow({ where: { id: inviter!.id } });
      const days = referralDaysToGrant(await daysThisMonth(tx, fresh.id, at));
      if (days > 0) {
        await tx.user.update({ where: { id: fresh.id }, data: { bonusProUntil: extendBonus(fresh.bonusProUntil, at, days) } });
      }
      // Recorded even at 0 days, so the inviter still sees the friend joined.
      await tx.event.create({ data: { userId: fresh.id, name: REWARD_EVENT, propsJson: { days }, createdAt: at } });
      return tx.user.findUniqueOrThrow({ where: { id: req.user.id } });
    });
    if (!user) return reply.code(409).send({ error: "already_claimed" });
    const res: MeResponse = { user: toWireUser(user) };
    return res;
  });
};
