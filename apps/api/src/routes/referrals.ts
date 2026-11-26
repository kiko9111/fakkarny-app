import type { FastifyPluginAsync, preHandlerAsyncHookHandler } from "fastify";
import { ClaimReferralRequest, type MeResponse, type ReferralResponse } from "@fakkarni/shared";
import { Prisma, type PrismaClient } from "../generated/prisma/client";
import { canClaim, newReferralCode, normalizeReferralCode, REFERRAL_MAX_DAYS_PER_MONTH } from "../billing/referral";
import { referralDaysThisMonth as daysThisMonth, rewardInviter } from "../billing/referral-store";
import { forgetCachedUserId } from "../plugins/auth";
import { toWireUser } from "../serialize";
import { baseUrl } from "./circles";

export interface ReferralRoutesOptions {
  prisma: PrismaClient;
  authenticate: preHandlerAsyncHookHandler;
  now?: () => Date;
  /** PUBLIC_URL, for the personal invite link. */
  publicUrl?: string;
}

/** The user's code, created on first use (retry on the rare collision). */
async function ensureCode(prisma: PrismaClient, user: { id: string; referralCode: string | null }): Promise<string> {
  if (user.referralCode) return user.referralCode;
  // The row handed to a read may be a few seconds old (plugins/auth.ts): never replace a code
  // that was made in the meantime, or the link already shared would stop working.
  const saved = await prisma.user.findUnique({ where: { id: user.id }, select: { referralCode: true } });
  if (saved?.referralCode) return saved.referralCode;
  for (let attempt = 0; ; attempt++) {
    try {
      const updated = await prisma.user.update({ where: { id: user.id }, data: { referralCode: newReferralCode() } });
      forgetCachedUserId(user.id);
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
    const code = await ensureCode(prisma, req.user);
    const res: ReferralResponse = {
      code,
      url: `${baseUrl(req, opts.publicUrl)}/r/${code}`,
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
      if (!(await rewardInviter(tx, req.user.id, inviter!.id, at))) return null;
      return tx.user.findUniqueOrThrow({ where: { id: req.user.id } });
    });
    if (!user) return reply.code(409).send({ error: "already_claimed" });
    // Committed: the inviter's next read must see their new Pro days.
    forgetCachedUserId(inviter!.id);
    const res: MeResponse = { user: toWireUser(user) };
    return res;
  });
};
