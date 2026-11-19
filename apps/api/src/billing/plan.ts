import { z } from "zod";
import { PRO_ENTITLEMENT } from "@fakkarni/shared";

/**
 * Subscriptions (FR-9): App Store / Google Play via RevenueCat, entitlement "pro".
 * The server mirrors the plan on User from RevenueCat webhooks (and an on-demand refresh),
 * and gates chatting on it. Data always stays readable.
 */

export type PlanName = "none" | "trial" | "monthly" | "yearly" | "expired";

/**
 * PRD F1: the first real exchange happens before the paywall ("the aha moment before the
 * paywall"). New users get this many messages before they must start the trial.
 */
export const FREE_MESSAGES_BEFORE_PAYWALL = 8;

export function hasActivePlan(user: { plan: PlanName; planExpiresAt: Date | null }, now: Date): boolean {
  if (user.plan !== "trial" && user.plan !== "monthly" && user.plan !== "yearly") return false;
  return !user.planExpiresAt || user.planExpiresAt > now;
}

export type Access = { ok: true } | { ok: false; reason: "trial_required" | "subscription_expired" };

/** May this user send a message right now? */
export function canChat(user: { plan: PlanName; planExpiresAt: Date | null }, userMessagesSoFar: number, now: Date): Access {
  if (hasActivePlan(user, now)) return { ok: true };
  if (user.plan === "none" && userMessagesSoFar < FREE_MESSAGES_BEFORE_PAYWALL) return { ok: true };
  return { ok: false, reason: user.plan === "none" ? "trial_required" : "subscription_expired" };
}

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
export function planFromEvent(e: RevenueCatEvent): { plan: PlanName; expiresAt: Date | null } | null {
  if (e.entitlement_ids && e.entitlement_ids.length && !e.entitlement_ids.includes(PRO_ENTITLEMENT)) return null;
  const expiresAt = e.expiration_at_ms ? new Date(e.expiration_at_ms) : null;
  if (GRANTING.has(e.type)) {
    return { plan: e.period_type === "TRIAL" ? "trial" : periodPlan(e.product_id), expiresAt };
  }
  if (e.type === "EXPIRATION") return { plan: "expired", expiresAt };
  return null;
}

/** RevenueCat REST v1 GET /subscribers/{id} → plan (used to refresh right after a purchase). */
export const RevenueCatSubscriber = z.object({
  subscriber: z.object({
    entitlements: z.record(z.string(), z.object({ expires_date: z.string().nullable(), product_identifier: z.string() })),
    subscriptions: z.record(z.string(), z.object({ period_type: z.string().optional(), expires_date: z.string().nullable().optional() })).optional(),
  }),
});

export function planFromSubscriber(json: z.infer<typeof RevenueCatSubscriber>, now: Date): { plan: PlanName; expiresAt: Date | null } {
  const ent = json.subscriber.entitlements[PRO_ENTITLEMENT];
  if (!ent) return { plan: "none", expiresAt: null };
  const expiresAt = ent.expires_date ? new Date(ent.expires_date) : null;
  if (expiresAt && expiresAt <= now) return { plan: "expired", expiresAt };
  const sub = json.subscriber.subscriptions?.[ent.product_identifier];
  return { plan: sub?.period_type === "trial" ? "trial" : periodPlan(ent.product_identifier), expiresAt };
}
