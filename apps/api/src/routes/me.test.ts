import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ExportResponse, INSTALL_ID_HEADER, MeResponse } from "@fakkarni/shared";
import { buildApp } from "../app";
import { hasTestDb, resetDb, testPrisma } from "../../test/db";

const SECRET = "test-secret-at-least-32-characters-long!!";
const token = (sub: string, opts: { aud?: string; secret?: string } = {}) =>
  new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setAudience(opts.aud ?? "authenticated")
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(opts.secret ?? SECRET));

describe.skipIf(!hasTestDb)("auth, settings, export, deletion (M5)", () => {
  const prisma = testPrisma();
  const deleted: string[] = [];
  const app = buildApp(
    { logger: false },
    { prisma, auth: { supabaseJwtSecret: SECRET, allowInstallId: true }, deleteAuthUser: async (sub) => void deleted.push(sub) },
  );
  const strict = buildApp({ logger: false }, { prisma, auth: { supabaseJwtSecret: SECRET, allowInstallId: false } });

  beforeEach(async () => {
    deleted.length = 0;
    await resetDb(prisma);
  });
  afterAll(async () => {
    await app.close();
    await strict.close();
    await prisma.$disconnect();
  });

  it("accepts a valid Supabase token and rejects bad ones", async () => {
    const sub = randomUUID();
    const ok = await app.inject({ method: "GET", url: "/me", headers: { authorization: `Bearer ${await token(sub)}` } });
    expect(ok.statusCode).toBe(200);
    expect(await prisma.user.count({ where: { authId: `supabase:${sub}` } })).toBe(1);
    for (const bad of [await token(sub, { secret: "x".repeat(40) }), await token(sub, { aud: "anon" }), "garbage"]) {
      expect((await app.inject({ method: "GET", url: "/me", headers: { authorization: `Bearer ${bad}` } })).statusCode).toBe(401);
    }
  });

  it("can require sign-in (install IDs refused)", async () => {
    expect((await strict.inject({ method: "GET", url: "/me", headers: { [INSTALL_ID_HEADER]: randomUUID() } })).statusCode).toBe(401);
  });

  it("links what a phone captured before sign-in to the account (same chat on a new phone)", async () => {
    const installId = randomUUID();
    const sub = randomUUID();
    await app.inject({ method: "POST", url: "/messages", headers: { [INSTALL_ID_HEADER]: installId }, payload: { client_id: "c1", text: "dentist sunday 6", created_at: new Date().toISOString() } });
    const link = await app.inject({
      method: "POST",
      url: "/auth/link",
      headers: { authorization: `Bearer ${await token(sub)}`, [INSTALL_ID_HEADER]: installId },
    });
    expect(link.statusCode).toBe(200);
    // A second phone signing in with the same account sees the same chat.
    const other = await app.inject({ method: "GET", url: "/messages", headers: { authorization: `Bearer ${await token(sub)}` } });
    expect(other.json().messages.map((m: { text: string }) => m.text)).toEqual(["dentist sunday 6"]);
    expect(await prisma.user.count()).toBe(1);
  });

  it("merges into an existing account", async () => {
    const sub = randomUUID();
    const installId = randomUUID();
    const auth = { authorization: `Bearer ${await token(sub)}` };
    await app.inject({ method: "POST", url: "/messages", headers: auth, payload: { client_id: "a", text: "from phone 1", created_at: new Date().toISOString() } });
    await app.inject({ method: "POST", url: "/messages", headers: { [INSTALL_ID_HEADER]: installId }, payload: { client_id: "b", text: "from phone 2 before sign-in", created_at: new Date().toISOString() } });
    await app.inject({ method: "POST", url: "/auth/link", headers: { ...auth, [INSTALL_ID_HEADER]: installId } });
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.message.count()).toBe(2);
  });

  it("updates settings (F10)", async () => {
    const headers = { [INSTALL_ID_HEADER]: randomUUID() };
    const res = await app.inject({
      method: "PATCH",
      url: "/me",
      headers,
      payload: { name: "Mona", wake_time: "06:30", sleep_time: "00:30", tone: "calm", checkin_interval_h: "4", always_direct: true, language: "en" },
    });
    expect(res.statusCode).toBe(200);
    expect(MeResponse.parse(res.json()).user).toMatchObject({ name: "Mona", wake_time: "06:30", tone: "calm", checkin_interval_h: "4", always_direct: true, language: "en" });
    expect((await app.inject({ method: "PATCH", url: "/me", headers, payload: { wake_time: "25:00" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "PATCH", url: "/me", headers, payload: { timezone: "Mars/Base" } })).statusCode).toBe(400);
  });

  it("keeps the picked city, which sets the money of new Daftar entries and splits", async () => {
    const headers = { [INSTALL_ID_HEADER]: randomUUID() };
    const before = await app.inject({ method: "GET", url: "/me", headers });
    expect(MeResponse.parse(before.json()).user.city).toBeNull();
    const res = await app.inject({ method: "PATCH", url: "/me", headers, payload: { city: "jeddah" } });
    expect(MeResponse.parse(res.json()).user.city).toBe("jeddah");
    expect((await app.inject({ method: "PATCH", url: "/me", headers, payload: { city: "atlantis" } })).statusCode).toBe(400);
    const entry = await app.inject({ method: "POST", url: "/daftar", headers, payload: { other_name: "Sara", direction: "owed_to_me", amount: 50 } });
    expect(entry.statusCode).toBe(201);
    expect(entry.json().entry.currency).toBe("SAR");
    expect(entry.json().share_text).toContain("ريال");
    const forgot = await app.inject({ method: "PATCH", url: "/me", headers, payload: { city: null } });
    expect(MeResponse.parse(forgot.json()).user.city).toBeNull();
  });

  it("exports everything, then deletes everything (FR-13)", async () => {
    const sub = randomUUID();
    const headers = { authorization: `Bearer ${await token(sub)}` };
    await app.inject({ method: "POST", url: "/messages", headers, payload: { client_id: "c1", text: "hello", created_at: new Date().toISOString() } });
    const user = await prisma.user.findFirstOrThrow();
    await prisma.memory.create({ data: { userId: user.id, kind: "fact", subject: "Coffee", content: "No coffee after 5" } });

    const exp = ExportResponse.parse((await app.inject({ method: "GET", url: "/me/export", headers })).json());
    expect(exp.messages).toHaveLength(1);
    expect(exp.memories[0]!.subject).toBe("Coffee");

    expect((await app.inject({ method: "DELETE", url: "/me", headers })).statusCode).toBe(204);
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.message.count()).toBe(0);
    expect(await prisma.memory.count()).toBe(0);
    expect(deleted).toEqual([sub]);
  });
});
