import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { INSTALL_ID_HEADER } from "@fakkarni/shared";
import { buildApp } from "../app";
import type { FriendModel } from "../ai/model";
import { createMetrics } from "../observability/metrics";
import { createConversationPipeline } from "../pipeline/conversation";
import { hasTestDb, resetDb, testPrisma } from "../../test/db";

const basic = (pw: string) => `Basic ${Buffer.from(`admin:${pw}`).toString("base64")}`;

describe("metrics", () => {
  it("counts requests and 5xx errors over 24 hours", () => {
    let t = 0;
    const m = createMetrics(() => t);
    m.record(200);
    m.record(500);
    m.record(404);
    expect(m.summary()).toEqual({ requests: 3, errors: 1, errorRate: 1 / 3 });
    t = 25 * 3600_000;
    expect(m.summary().requests).toBe(0);
  });
});

describe.skipIf(!hasTestDb)("hardening (M7)", () => {
  const prisma = testPrisma();
  beforeEach(() => resetDb(prisma));
  afterAll(() => prisma.$disconnect());

  it("admin dashboard needs the password and never shows chat content (FR-15)", async () => {
    const app = buildApp({ logger: false }, { prisma, adminPassword: "s3cret-admin", rateLimitPerMinute: false });
    const headers = { [INSTALL_ID_HEADER]: randomUUID() };
    await app.inject({ method: "POST", url: "/messages", headers, payload: { client_id: "c1", text: "my secret diary entry", created_at: new Date().toISOString() } });
    const user = await prisma.user.findFirstOrThrow();
    await prisma.event.create({ data: { userId: user.id, name: "ai_call", propsJson: { cost_usd: 0.002 } } });

    expect((await app.inject({ method: "GET", url: "/admin" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/admin", headers: { authorization: basic("wrong") } })).statusCode).toBe(401);
    const page = await app.inject({ method: "GET", url: "/admin", headers: { authorization: basic("s3cret-admin") } });
    expect(page.statusCode).toBe(200);
    expect(page.body).not.toContain("secret diary");
    const stats = (await app.inject({ method: "GET", url: "/admin/stats", headers: { authorization: basic("s3cret-admin") } })).json();
    expect(stats.users.total).toBe(1);
    expect(stats.ai_cost_30d.total_usd).toBeCloseTo(0.002);
    expect(JSON.stringify(stats)).not.toContain("secret diary");
    await app.close();
  });

  it("is not served without a password", async () => {
    const app = buildApp({ logger: false }, { prisma, rateLimitPerMinute: false });
    expect((await app.inject({ method: "GET", url: "/admin" })).statusCode).toBe(404);
    await app.close();
  });

  it("rate-limits message sending per caller", async () => {
    const app = buildApp({ logger: false }, { prisma });
    const headers = { [INSTALL_ID_HEADER]: randomUUID() };
    const codes: number[] = [];
    for (let i = 0; i < 32; i++) {
      codes.push((await app.inject({ method: "POST", url: "/messages", headers, payload: { client_id: `c${i}`, text: "hi", created_at: new Date().toISOString() } })).statusCode);
    }
    expect(codes.filter((c) => c === 201)).toHaveLength(30);
    expect(codes.at(-1)).toBe(429);
    // Another user is unaffected.
    expect((await app.inject({ method: "POST", url: "/messages", headers: { [INSTALL_ID_HEADER]: randomUUID() }, payload: { client_id: "x", text: "hi", created_at: new Date().toISOString() } })).statusCode).toBe(201);
    await app.close();
  });

  it("pauses AI after the daily fair-use cap, telling the user once", async () => {
    let calls = 0;
    const model: FriendModel = {
      respond: async () => (calls++, { ok: true, usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, output: { reply: ["ok"], create_items: [], update_items: [], save_memories: [], crisis: false } }),
      complete: async () => ({ text: "", usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }),
    };
    const app = buildApp({ logger: false }, { prisma, rateLimitPerMinute: false, pipeline: createConversationPipeline({ model, dailyCap: 3 }) });
    const headers = { [INSTALL_ID_HEADER]: randomUUID() };
    const replies: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await app.inject({ method: "POST", url: "/messages", headers, payload: { client_id: `c${i}`, text: `plan number ${i}`, created_at: new Date().toISOString() } });
      replies.push(res.json().replies.length);
    }
    expect(calls).toBe(3);
    expect(replies).toEqual([1, 1, 1, 1, 0, 0]); // cap notice once, then quiet
    expect(await prisma.message.count({ where: { role: "user" } })).toBe(6); // nothing lost
    await app.close();
  });
});
