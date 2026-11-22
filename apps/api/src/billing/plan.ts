import { z } from "zod";
import { PRO_ENTITLEMENT } from "@fakkarni/shared";

/**
 * Subscriptions: App Store / Google Play via RevenueCat, entitlement "pro" (Pro and Family
 * products both grant it). The server mirrors the plan on User from RevenueCat webhooks (and
 * an on-demand refresh). Chat is never locked: free users get a daily AI allowance.
 */

export type PlanName = "none" | "trial" | "monthly" | "yearly" | "expired";

type PlanUser = { plan: PlanName; planExpiresAt: Date | null };

export function hasActivePlan(user: PlanUser, now: Date): boolean {
  if (user.plan !== "trial" && user.plan !== "monthly" && user.plan !== "yearly") return false;
  return !user.planExpiresAt || user.planExpiresAt > now;
}

/** Pro features are on: a paid plan (Pro or Family) or Pro days earned by inviting friends. */
export function hasPro(user: PlanUser & { bonusProUntil?: Date | null }, now: Date): boolean {
  return hasActivePlan(user, now) || (!!user.bonusProUntil && user.bonusProUntil > now);
}

/**
 * Free AI allowance (owner decision, 2026-11-22). Everything shared (circles, Daftar, tasks,
 * reminders) is free and unlimited; AI depth is what Pro pays for. Free users get a generous
 * first week, then a small daily allowance. Messages answered by rules never count, and a
 * crisis message is never blocked.
 */
export const FREE_AI_FIRST_WEEK_PER_DAY = 30;
export const FREE_AI_PER_DAY = 5;
export const FIRST_WEEK_DAYS = 7;

/** AI messages this user may use today, or null when unlimited (Pro: fair use only). */
export function dailyAiAllowance(user: PlanUser & { bonusProUntil?: Date | null; createdAt: Date }, now: Date): number | null {
  if (hasPro(user, now)) return null;
  const inFirstWeek = now.getTime() - user.createdAt.getTime() < FIRST_WEEK_DAYS * 86_400_000;
  return inFirstWeek ? FREE_AI_FIRST_WEEK_PER_DAY : FREE_AI_PER_DAY;
}

/** Founders' offer: EGP 499 for the first year, first 1,000 buyers only. */
export const FOUNDERS_LIMIT = 1000;
export const isFoundersProduct = (productId: string | null | undefined) => !!productId && /founder/i.test(productId);

/** Family = Pro for up to 6 people, one payer. Detected from the store product id. */
export const FAMILY_MAX_MEMBERS = 6;
export const tierFromProduct = (productId: string | null | undefined): "pro" | "family" =>
  productId && /family/i.test(productId) ? "family" : "pro";

const periodPlan = (productId: string | undefined | null): "monthly" | "yearly" =>
  productId && /year|annual|12m|p1y/i.test(productId) ? "yearly" : "monthly";

/** https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields */
export const RevenueCatEvent = z.object({
  type: z.string(),
  app_user_id: z.string(),
  original_app_user_id: z.string().optional(),
  aliases: z.array(z.string()).optional(),
  product_id: z.string().nullable().optional(),
  period_type: z.string().nullable().optional(),
  expiration_at_ms: z.number().nullable().optional(),
  entitlement_ids: z.array(z.string()).nullable().optional(),
  environment: z.string().optional(),
  transferred_to: z.array(z.string()).optional(),
  transferred_from: z.array(z.string()).optional(),
});
export type RevenueCatEvent = z.infer<typeof RevenueCatEvent>;
export const RevenueCatWebhook = z.object({ event: RevenueCatEvent });

const GRANTING = new Set(["INITIAL_PURCHASE", "RENEWAL", "PRODUCT_CHANGE", "UNCANCELLATION", "NON_RENEWING_PURCHASE", "SUBSCRIPTION_EXTENDED", "TEMPORARY_ENTITLEMENT_GRANT"]);

/**
 * New plan state for an event, or null when the event doesn't change it
 * (CANCELLATION keeps access until expiry; BILLING_ISSUE keeps the grace period).
 */
export interface PlanState {
  plan: PlanName;
  expiresAt: Date | null;
  tier: "pro" | "family";
  productId: string | null;
}

export function planFromEvent(e: RevenueCatEvent): PlanState | null {
  if (e.entitlement_ids && e.entitlement_ids.length && !e.entitlement_ids.includes(PRO_ENTITLEMENT)) return null;
  const expiresAt = e.expiration_at_ms ? new Date(e.expiration_at_ms) : null;
  const productId = e.product_id ?? null;
  const tier = tierFromProduct(productId);
  if (GRANTING.has(e.type)) {
    return { plan: e.period_type === "TRIAL" ? "trial" : periodPlan(e.product_id), expiresAt, tier, productId };
  }
  if (e.type === "EXPIRATION") return { plan: "expired", expiresAt, tier, productId };
  return null;
}

/** RevenueCat REST v1 GET /subscribers/{id} → plan (used to refresh right after a purchase). */
export const RevenueCatSubscriber = z.object({
  subscriber: z.object({
    entitlements: z.record(z.string(), z.object({ expires_date: z.string().nullable(), product_identifier: z.string() })),
    subscriptions: z.record(z.string(), z.object({ period_type: z.string().optional(), expires_date: z.string().nullable().optional() })).optional(),
  }),
});

export function planFromSubscriber(json: z.infer<typeof RevenueCatSubscriber>, now: Date): PlanState {
  const ent = json.subscriber.entitlements[PRO_ENTITLEMENT];
  if (!ent) return { plan: "none", expiresAt: null, tier: "pro", productId: null };
  const productId = ent.product_identifier;
  const tier = tierFromProduct(productId);
  const expiresAt = ent.expires_date ? new Date(ent.expires_date) : null;
  if (expiresAt && expiresAt <= now) return { plan: "expired", expiresAt, tier, productId };
  const sub = json.subscriber.subscriptions?.[ent.product_identifier];
  return { plan: sub?.period_type === "trial" ? "trial" : periodPlan(ent.product_identifier), expiresAt, tier, productId };
}
