import { describe, expect, it } from "vitest";
import { dailyAiAllowance, FREE_AI_FIRST_WEEK_PER_DAY, FREE_AI_PER_DAY, hasPro, isFoundersProduct, planFromEvent, planFromSubscriber, tierFromProduct } from "./plan";

const now = new Date("2026-11-19T10:00:00Z");
const later = new Date("2026-11-26T10:00:00Z");

const day = 86_400_000;
describe("dailyAiAllowance", () => {
  const free = { plan: "none" as const, planExpiresAt: null, bonusProUntil: null };
  it("is generous in the first week, then 5 a day", () => {
    expect(dailyAiAllowance({ ...free, createdAt: now }, now)).toBe(FREE_AI_FIRST_WEEK_PER_DAY);
    expect(dailyAiAllowance({ ...free, createdAt: new Date(now.getTime() - 6 * day) }, now)).toBe(30);
    expect(dailyAiAllowance({ ...free, createdAt: new Date(now.getTime() - 7 * day) }, now)).toBe(FREE_AI_PER_DAY);
    expect(dailyAiAllowance({ ...free, plan: "expired", createdAt: new Date(now.getTime() - 90 * day) }, now)).toBe(5);
  });
  it("is unlimited on a paid plan or on invite days", () => {
    const old = new Date(now.getTime() - 90 * day);
    expect(dailyAiAllowance({ ...free, plan: "monthly", planExpiresAt: later, createdAt: old }, now)).toBeNull();
    expect(dailyAiAllowance({ ...free, plan: "trial", planExpiresAt: later, createdAt: old }, now)).toBeNull();
    expect(dailyAiAllowance({ ...free, bonusProUntil: later, createdAt: old }, now)).toBeNull();
    expect(dailyAiAllowance({ ...free, bonusProUntil: now, createdAt: old }, now)).toBe(5);
    expect(dailyAiAllowance({ ...free, plan: "monthly", planExpiresAt: now, createdAt: old }, now)).toBe(5);
  });
  it("reads tier and founders' offer from the product id", () => {
    expect(tierFromProduct("zaki_family_monthly")).toBe("family");
    expect(tierFromProduct("zaki_pro_yearly")).toBe("pro");
    expect(isFoundersProduct("zaki_founders_yearly")).toBe(true);
    expect(isFoundersProduct("zaki_pro_yearly")).toBe(false);
    expect(hasPro({ ...free, bonusProUntil: later }, now)).toBe(true);
  });
});

describe("planFromEvent", () => {
  const base = { app_user_id: "u1", expiration_at_ms: later.getTime(), entitlement_ids: ["pro"] };
  it("maps trial starts and purchases", () => {
    expect(planFromEvent({ ...base, type: "INITIAL_PURCHASE", period_type: "TRIAL", product_id: "fakkarni_monthly" })).toEqual({ plan: "trial", expiresAt: later, tier: "pro", productId: "fakkarni_monthly" });
    expect(planFromEvent({ ...base, type: "RENEWAL", period_type: "NORMAL", product_id: "zaki_family_yearly" })?.tier).toBe("family");
    expect(planFromEvent({ ...base, type: "RENEWAL", period_type: "NORMAL", product_id: "fakkarni_yearly" })?.plan).toBe("yearly");
    expect(planFromEvent({ ...base, type: "RENEWAL", period_type: "NORMAL", product_id: "fakkarni_monthly" })?.plan).toBe("monthly");
  });
  it("keeps access on cancellation until expiration, then expires", () => {
    expect(planFromEvent({ ...base, type: "CANCELLATION" })).toBeNull();
    expect(planFromEvent({ ...base, type: "EXPIRATION" })?.plan).toBe("expired");
  });
  it("ignores other entitlements", () => {
    expect(planFromEvent({ ...base, entitlement_ids: ["other"], type: "INITIAL_PURCHASE" })).toBeNull();
  });
});

describe("planFromSubscriber", () => {
  it("reads the pro entitlement", () => {
    const json = {
      subscriber: {
        entitlements: { pro: { expires_date: later.toISOString(), product_identifier: "fakkarni_monthly" } },
        subscriptions: { fakkarni_monthly: { period_type: "trial" } },
      },
    };
    expect(planFromSubscriber(json, now)).toEqual({ plan: "trial", expiresAt: later, tier: "pro", productId: "fakkarni_monthly" });
    expect(planFromSubscriber({ subscriber: { entitlements: {} } }, now).plan).toBe("none");
    expect(planFromSubscriber(json, new Date("2027-01-01")).plan).toBe("expired");
  });
});
