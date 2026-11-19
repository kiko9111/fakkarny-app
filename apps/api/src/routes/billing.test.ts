import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { INSTALL_ID_HEADER, MeResponse } from "@fakkarni/shared";
import { buildApp } from "../app";
import { FREE_MESSAGES_BEFORE_PAYWALL } from "../billing/plan";
import { hasTestDb, resetDb, testPrisma } from "../../test/db";

describe.skipIf(!hasTestDb)("subscriptions (FR-9)", () => {
  const prisma = testPrisma();
  let subscriberJson: unknown = { subscriber: { entitlements: {} } };
  const app = buildApp(
    { logger: false },
    {
      prisma,
      billing: {
        requireSubscription: true,
        webhookAuth: "Bearer whsec_test",
        revenueCatSecretKey: "sk_test",
        fetchImpl: (async () => new Response(JSON.stringify(subscriberJson), { status: 200 })) as typeof fetch,
      },
    },
  );
  const headers = { [INSTALL_ID_HEADER]: randomUUID() };
  const send = (n: number) =>
    app.inject({ method: "POST", url: "/messages", headers, payload: { client_id: `c${n}`, text: `message ${n}`, created_at: new Date().toISOString() } });
  const webhook = (event: object, auth = "Bearer whsec_test") =>
    app.inject({ method: "POST", url: "/webhooks/revenuecat", headers: { authorization: auth }, payload: { api_version: "1.0", event } });

  beforeEach(() => resetDb(prisma));
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("gives the first real exchange for free, then asks for the trial (data stays readable)", async () => {
    for (let i = 0; i < FREE_MESSAGES_BEFORE_PAYWALL; i++) expect((await send(i)).statusCode).toBe(201);
    const locked = await send(99);
    expect(locked.statusCode).toBe(402);
    expect(locked.json()).toEqual({ error: "trial_required" });
    expect((await app.inject({ method: "GET", url: "/messages", headers })).statusCode).toBe(200);
  });

  it("unlocks on a trial purchase webhook and locks again on expiration", async () => {
    await send(0);
    const user = await prisma.user.findFirstOrThrow();
    await prisma.user.update({ where: { id: user.id }, data: { plan: "expired" } });
    expect((await send(1)).statusCode).toBe(402);

    const exp = Date.now() + 7 * 86400_000;
    expect((await webhook({ type: "INITIAL_PURCHASE", app_user_id: user.id, period_type: "TRIAL", product_id: "fakkarni_monthly", expiration_at_ms: exp, entitlement_ids: ["pro"] })).statusCode).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).plan).toBe("trial");
    expect((await send(2)).statusCode).toBe(201);

    await webhook({ type: "CANCELLATION", app_user_id: user.id, expiration_at_ms: exp, entitlement_ids: ["pro"] });
    expect((await send(3)).statusCode).toBe(201); // access until the period ends
    await webhook({ type: "EXPIRATION", app_user_id: user.id, expiration_at_ms: Date.now() - 1000, entitlement_ids: ["pro"] });
    const res = await send(4);
    expect(res.statusCode).toBe(402);
    expect(res.json()).toEqual({ error: "subscription_expired" });
  });

  it("rejects webhooks without the shared secret and ignores unknown users", async () => {
    expect((await webhook({ type: "RENEWAL", app_user_id: randomUUID() }, "Bearer nope")).statusCode).toBe(401);
    expect((await webhook({ type: "RENEWAL", app_user_id: "$RCAnonymousID:abc" })).statusCode).toBe(200);
  });

  it("refreshes the plan right after a purchase", async () => {
    await send(0);
    subscriberJson = {
      subscriber: {
        entitlements: { pro: { expires_date: new Date(Date.now() + 365 * 86400_000).toISOString(), product_identifier: "fakkarni_yearly" } },
        subscriptions: { fakkarni_yearly: { period_type: "normal" } },
      },
    };
    const res = await app.inject({ method: "POST", url: "/me/plan/refresh", headers });
    expect(MeResponse.parse(res.json()).user.plan).toBe("yearly");
  });
});
