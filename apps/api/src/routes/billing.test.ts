import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { INSTALL_ID_HEADER, MeResponse } from "@fakkarni/shared";
import { buildApp } from "../app";
import { FREE_AI_FIRST_WEEK_PER_DAY, FREE_AI_PER_DAY } from "../billing/plan";
import { createConversationPipeline } from "../pipeline/conversation";
import type { FriendModel } from "../ai/model";
import { hasTestDb, resetDb, testPrisma } from "../../test/db";

describe.skipIf(!hasTestDb)("subscriptions (FR-9)", () => {
  const prisma = testPrisma();
  let subscriberJson: unknown = { subscriber: { entitlements: {} } };
  const usage = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  let aiCalls = 0;
  const model: FriendModel = {
    async respond() {
      aiCalls++;
      return { ok: true, usage, output: { reply: ["تمام"], create_items: [], update_items: [], save_memories: [], crisis: false } };
    },
    async complete() {
      return { text: "summary", usage };
    },
  };
  const app = buildApp(
    { logger: false },
    {
      prisma,
      rateLimitPerMinute: false,
      pipeline: createConversationPipeline({ model }),
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

  const text = (n: number) => `fakarny bokra a3ady 3la mama ${n}`;
  const sendText = (id: string, t: string) =>
    app.inject({ method: "POST", url: "/messages", headers, payload: { client_id: id, text: t, created_at: new Date().toISOString() } });
  const ageUser = async (days: number) => {
    const user = await prisma.user.findFirstOrThrow();
    await prisma.user.update({ where: { id: user.id }, data: { createdAt: new Date(Date.now() - days * 86_400_000) } });
    return user;
  };

  it("never locks chat: after the free AI messages Zaki nudges to Pro once, and rules replies stay free", async () => {
    await sendText("first", text(0));
    await ageUser(30);
    aiCalls = 0;
    for (let i = 1; i <= FREE_AI_PER_DAY - 1; i++) {
      const res = await sendText(`c${i}`, text(i));
      expect(res.statusCode).toBe(201);
      expect(res.json().ai_allowance).toEqual({ limit: FREE_AI_PER_DAY, used: i + 1 });
    }
    expect(aiCalls).toBe(FREE_AI_PER_DAY - 1);

    const over = await sendText("over", text(98));
    expect(over.statusCode).toBe(201);
    expect(over.json().replies).toHaveLength(1);
    expect(over.json().replies[0].kind).toBe("upsell");
    expect(over.json().replies[0].text).toContain("زكي برو");
    const again = await sendText("again", text(99));
    expect(again.json().replies[0].kind).toBe("upsell");
    expect(again.json().replies[0].text).not.toContain("زكي برو");
    expect(aiCalls).toBe(FREE_AI_PER_DAY - 1);

    // A thank-you is answered by rules and costs nothing; a crisis message always reaches Zaki.
    const thanks = await sendText("thanks", "شكرا");
    expect(thanks.json().replies[0].kind).toBe("chat");
    const crisis = await sendText("crisis", "عايز اموت");
    expect(crisis.json().replies[0].kind).toBe("chat");
    expect(aiCalls).toBe(FREE_AI_PER_DAY);
    expect((await app.inject({ method: "GET", url: "/messages", headers })).statusCode).toBe(200);
  });

  it("gives 30 AI messages a day in the first week", async () => {
    const res = await sendText("w1", text(0));
    expect(res.json().ai_allowance).toEqual({ limit: FREE_AI_FIRST_WEEK_PER_DAY, used: 1 });
  });

  it("is unlimited on Pro, Family and invite days, and limited again after expiration", async () => {
    await sendText("first", text(0));
    const user = await ageUser(30);
    await prisma.event.createMany({ data: Array.from({ length: 10 }, () => ({ userId: user.id, name: "ai_call", propsJson: { purpose: "chat" } })) });
    expect((await sendText("free", text(1))).json().replies[0].kind).toBe("upsell");

    const exp = Date.now() + 7 * 86400_000;
    expect((await webhook({ type: "INITIAL_PURCHASE", app_user_id: user.id, period_type: "NORMAL", product_id: "zaki_family_monthly", expiration_at_ms: exp, entitlement_ids: ["pro"] })).statusCode).toBe(200);
    const paid = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect([paid.plan, paid.planTier, paid.planProductId]).toEqual(["monthly", "family", "zaki_family_monthly"]);
    const pro = await sendText("pro", text(2));
    expect(pro.json().replies[0].kind).toBe("chat");
    expect(pro.json().ai_allowance.limit).toBeNull();

    await webhook({ type: "CANCELLATION", app_user_id: user.id, expiration_at_ms: exp, entitlement_ids: ["pro"] });
    expect((await sendText("cancelled", text(3))).json().replies[0].kind).toBe("chat"); // access until the period ends
    await webhook({ type: "EXPIRATION", app_user_id: user.id, expiration_at_ms: Date.now() - 1000, entitlement_ids: ["pro"] });
    expect((await sendText("expired", text(4))).json().replies[0].kind).toBe("upsell");

    await prisma.user.update({ where: { id: user.id }, data: { bonusProUntil: new Date(exp) } });
    expect((await sendText("bonus", text(5))).json().replies[0].kind).toBe("chat");
    expect(MeResponse.parse((await app.inject({ method: "GET", url: "/me", headers })).json()).user.pro).toBe(true);
  });

  it("counts founders' offer buyers", async () => {
    await sendText("first", text(0));
    const user = await prisma.user.findFirstOrThrow();
    expect((await app.inject({ method: "GET", url: "/billing/offers", headers })).json()).toEqual({ founders_left: 1000 });
    await webhook({ type: "INITIAL_PURCHASE", app_user_id: user.id, period_type: "NORMAL", product_id: "zaki_founders_yearly", expiration_at_ms: Date.now() + 365 * 86400_000, entitlement_ids: ["pro"] });
    expect((await app.inject({ method: "GET", url: "/billing/offers", headers })).json()).toEqual({ founders_left: 999 });
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
