import { describe, expect, it } from "vitest";
import { canChat, FREE_MESSAGES_BEFORE_PAYWALL, planFromEvent, planFromSubscriber } from "./plan";

const now = new Date("2026-11-19T10:00:00Z");
const later = new Date("2026-11-26T10:00:00Z");

describe("canChat", () => {
  it("lets new users have the first real exchange before the paywall", () => {
    expect(canChat({ plan: "none", planExpiresAt: null }, 0, now).ok).toBe(true);
    expect(canChat({ plan: "none", planExpiresAt: null }, FREE_MESSAGES_BEFORE_PAYWALL, now)).toEqual({ ok: false, reason: "trial_required" });
  });
  it("allows trial and paid plans until they expire", () => {
    expect(canChat({ plan: "trial", planExpiresAt: later }, 500, now).ok).toBe(true);
    expect(canChat({ plan: "yearly", planExpiresAt: null }, 500, now).ok).toBe(true);
    expect(canChat({ plan: "monthly", planExpiresAt: now }, 500, now)).toEqual({ ok: false, reason: "subscription_expired" });
    expect(canChat({ plan: "expired", planExpiresAt: null }, 0, now)).toEqual({ ok: false, reason: "subscription_expired" });
  });
});

describe("planFromEvent", () => {
  const base = { app_user_id: "u1", expiration_at_ms: later.getTime(), entitlement_ids: ["pro"] };
  it("maps trial starts and purchases", () => {
    expect(planFromEvent({ ...base, type: "INITIAL_PURCHASE", period_type: "TRIAL", product_id: "fakkarni_monthly" })).toEqual({ plan: "trial", expiresAt: later });
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
    expect(planFromSubscriber(json, now)).toEqual({ plan: "trial", expiresAt: later });
    expect(planFromSubscriber({ subscriber: { entitlements: {} } }, now).plan).toBe("none");
    expect(planFromSubscriber(json, new Date("2027-01-01")).plan).toBe("expired");
  });
});
