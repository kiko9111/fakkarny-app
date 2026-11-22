import { timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsync, preHandlerAsyncHookHandler } from "fastify";
import type { BillingOffersResponse, MeResponse } from "@fakkarni/shared";
import type { PrismaClient } from "../generated/prisma/client";
import { FOUNDERS_LIMIT, planFromEvent, planFromSubscriber, RevenueCatSubscriber, RevenueCatWebhook, type PlanState } from "../billing/plan";
import { toWireUser } from "../serialize";

export interface BillingOptions {
  prisma: PrismaClient;
  authenticate: preHandlerAsyncHookHandler;
  /** The Authorization header value configured on the RevenueCat webhook. */
  webhookAuth?: string;
  /** RevenueCat secret API key (server only), for refreshing a user's plan on demand. */
  revenueCatSecretKey?: string;
  fetchImpl?: typeof fetch;
}

const planData = (p: PlanState) => ({ plan: p.plan, planExpiresAt: p.expiresAt, planTier: p.tier, planProductId: p.productId });

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export const billingRoutes: FastifyPluginAsync<BillingOptions> = async (app, opts) => {
  const { prisma } = opts;
  const fetchImpl = opts.fetchImpl ?? fetch;

  /**
   * RevenueCat → us. The phone logs in to RevenueCat with our user id, so app_user_id is
   * User.id. Unknown ids (e.g. anonymous RevenueCat users) are acknowledged and ignored.
   */
  app.post("/webhooks/revenuecat", async (req, reply) => {
    if (!opts.webhookAuth || !safeEqual(req.headers.authorization ?? "", opts.webhookAuth)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const body = RevenueCatWebhook.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    const e = body.data.event;
    const ids = [e.app_user_id, e.original_app_user_id, ...(e.aliases ?? []), ...(e.transferred_to ?? [])].filter(
      (id): id is string => !!id && /^[0-9a-f-]{36}$/i.test(id),
    );
    const next = e.type === "TRANSFER" ? null : planFromEvent(e);
    if (e.type === "TRANSFER" && e.transferred_from?.length) {
      // Restoring on another account moves the purchase: the old account loses access.
      const from = e.transferred_from.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
      await prisma.user.updateMany({ where: { id: { in: from } }, data: { plan: "expired" } });
    }
    if (next && ids.length) {
      const user = await prisma.user.findFirst({ where: { id: { in: ids } } });
      if (user) {
        await prisma.user.update({ where: { id: user.id }, data: planData(next) });
        await prisma.event.create({ data: { userId: user.id, name: "subscription_event", propsJson: { type: e.type, plan: next.plan, tier: next.tier, product: next.productId, environment: e.environment ?? null } } });
      }
    }
    return reply.code(200).send({ ok: true });
  });

  /** Called by the app right after a purchase/restore so access unlocks without waiting for the webhook. */
  app.post("/me/plan/refresh", { preHandler: opts.authenticate }, async (req, reply) => {
    if (!opts.revenueCatSecretKey) return reply.code(503).send({ error: "billing_not_configured" });
    const res = await fetchImpl(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(req.user.id)}`, {
      headers: { authorization: `Bearer ${opts.revenueCatSecretKey}`, accept: "application/json" },
    });
    if (!res.ok) return reply.code(502).send({ error: "billing_unavailable" });
    const parsed = RevenueCatSubscriber.safeParse(await res.json());
    if (!parsed.success) return reply.code(502).send({ error: "billing_unavailable" });
    const next = planFromSubscriber(parsed.data, new Date());
    const user = await prisma.user.update({ where: { id: req.user.id }, data: planData(next) });
    // Keeps the founders' count right even if the webhook is late or missed.
    if (next.productId?.toLowerCase().includes("founder")) await prisma.event.create({ data: { userId: user.id, name: "subscription_event", propsJson: { type: "refresh", plan: next.plan, tier: next.tier, product: next.productId } } });
    const out: MeResponse = { user: toWireUser(user) };
    return out;
  });

  /** What the paywall may offer right now: the founders' offer is for the first 1,000 buyers. */
  app.get("/billing/offers", { preHandler: opts.authenticate }, async () => {
    // A founders' place stays taken after its buyer switches plans: count everyone who ever
    // had the product (webhook events), not only who has it now.
    const [now, ever] = await Promise.all([
      prisma.user.findMany({ where: { planProductId: { contains: "founder", mode: "insensitive" } }, select: { id: true } }),
      prisma.event.findMany({ where: { name: "subscription_event", propsJson: { path: ["product"], string_contains: "founder" } }, select: { userId: true }, distinct: ["userId"] }),
    ]);
    const founders = new Set([...now.map((u) => u.id), ...ever.map((e) => e.userId)]).size;
    const res: BillingOffersResponse = { founders_left: Math.max(0, FOUNDERS_LIMIT - founders) };
    return res;
  });
};
