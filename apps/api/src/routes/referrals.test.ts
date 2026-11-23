import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { INSTALL_ID_HEADER, ReferralResponse } from "@fakkarni/shared";
import { buildApp } from "../app";
import { canClaim, extendBonus, newReferralCode, referralDaysToGrant } from "../billing/referral";
import { hasTestDb, resetDb, testPrisma } from "../../test/db";

const SECRET = "test-secret-at-least-32-characters-long!!";
const token = (sub: string) =>
  new SignJWT({ role: "authenticated" }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setAudience("authenticated").setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

describe("referral rules", () => {
  const now = new Date("2026-11-22T10:00:00Z");
  it("grants 7 days a friend, at most 28 a month", () => {
    expect(referralDaysToGrant(0)).toBe(7);
    expect(referralDaysToGrant(21)).toBe(7);
    expect(referralDaysToGrant(25)).toBe(3);
    expect(referralDaysToGrant(28)).toBe(0);
  });
  it("stacks bonus days on a running bonus", () => {
    expect(extendBonus(null, now, 7).toISOString()).toBe("2026-11-29T10:00:00.000Z");
    expect(extendBonus(new Date("2026-11-25T10:00:00Z"), now, 7).toISOString()).toBe("2026-12-02T10:00:00.000Z");
    expect(extendBonus(new Date("2026-11-01T10:00:00Z"), now, 7).toISOString()).toBe("2026-11-29T10:00:00.000Z");
  });
  it("makes readable codes and refuses bad claims", () => {
    expect(newReferralCode()).toMatch(/^[A-HJKMNP-Z2-9]{7}$/);
    const me = { id: "a", authId: "supabase:x", referredById: null, createdAt: now };
    expect(canClaim(me, { id: "b" }, now)).toEqual({ ok: true });
    expect(canClaim(me, { id: "a" }, now)).toEqual({ ok: false, reason: "own_code" });
    expect(canClaim(me, null, now)).toEqual({ ok: false, reason: "unknown_code" });
    expect(canClaim({ ...me, authId: "install:x" }, { id: "b" }, now)).toEqual({ ok: false, reason: "sign_in_required" });
    expect(canClaim({ ...me, referredById: "c" }, { id: "b" }, now)).toEqual({ ok: false, reason: "already_claimed" });
    expect(canClaim({ ...me, createdAt: new Date("2026-11-01T00:00:00Z") }, { id: "b" }, now)).toEqual({ ok: false, reason: "too_late" });
  });
});

describe.skipIf(!hasTestDb)("referrals", () => {
  const prisma = testPrisma();
  const app = buildApp({ logger: false }, { prisma, rateLimitPerMinute: false, auth: { supabaseJwtSecret: SECRET, allowInstallId: true } });
  beforeEach(() => resetDb(prisma));
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });
  const signedIn = async () => ({ authorization: `Bearer ${await token(randomUUID())}` });
  const claim = (headers: Record<string, string>, code: string) => app.inject({ method: "POST", url: "/referrals/claim", headers, payload: { code } });

  it("gives the inviter 7 Pro days per signed-in friend, capped at 28 a month", async () => {
    const inviter = await signedIn();
    const mine = ReferralResponse.parse((await app.inject({ method: "GET", url: "/me/referral", headers: inviter })).json());
    expect(mine.days_this_month).toBe(0);
    expect(mine.url).toMatch(new RegExp(`/r/${mine.code}$`));
    // The public page shows the inviter's first name only, and works without signing in.
    await app.inject({ method: "PATCH", url: "/me", headers: inviter, payload: { name: "Mona Ali" } });
    const page = await app.inject({ method: "GET", url: `/r/${mine.code.toLowerCase()}?lang=en` });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain("Mona invited you");
    expect(page.body).not.toContain("Ali");
    expect(page.body).toContain(`fakkarni://ref/${mine.code}`);
    expect((await app.inject({ method: "GET", url: "/r/NOPE999" })).statusCode).toBe(404);
    // The code is stable.
    expect((await app.inject({ method: "GET", url: "/me/referral", headers: inviter })).json().code).toBe(mine.code);

    const friend = await signedIn();
    const res = await claim(friend, mine.code.toLowerCase());
    expect(res.statusCode).toBe(200);
    // Both sides win: the friend gets 7 Pro days too.
    const friendMe = res.json().user;
    expect(friendMe.pro).toBe(true);
    expect(Math.round((new Date(friendMe.bonus_pro_until).getTime() - Date.now()) / 86_400_000)).toBe(7);
    expect((await claim(friend, mine.code)).json()).toEqual({ error: "already_claimed" });

    let me = (await app.inject({ method: "GET", url: "/me", headers: inviter })).json().user;
    expect(me.pro).toBe(true);
    const days = (new Date(me.bonus_pro_until).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);

    for (let i = 0; i < 4; i++) expect((await claim(await signedIn(), mine.code)).statusCode).toBe(200);
    me = (await app.inject({ method: "GET", url: "/me", headers: inviter })).json().user;
    expect(Math.round((new Date(me.bonus_pro_until).getTime() - Date.now()) / 86_400_000)).toBe(28);
    expect((await app.inject({ method: "GET", url: "/me/referral", headers: inviter })).json().days_this_month).toBe(28);
  });

  it("refuses own code, unknown codes and friends who haven't signed in", async () => {
    const inviter = await signedIn();
    const { code } = (await app.inject({ method: "GET", url: "/me/referral", headers: inviter })).json();
    expect((await claim(inviter, code)).json()).toEqual({ error: "own_code" });
    expect((await claim(await signedIn(), "ZZZZZZZ")).statusCode).toBe(404);
    expect((await claim({ [INSTALL_ID_HEADER]: randomUUID() }, code)).json()).toEqual({ error: "sign_in_required" });
    expect((await app.inject({ method: "GET", url: "/me", headers: inviter })).json().user.bonus_pro_until).toBeNull();
  });
});

describe.skipIf(!hasTestDb)("product analytics", () => {
  const prisma = testPrisma();
  const app = buildApp({ logger: false }, { prisma, rateLimitPerMinute: false, auth: { supabaseJwtSecret: SECRET, allowInstallId: true } });
  beforeEach(() => resetDb(prisma));
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("stores counted events from the phone and refuses unknown names or long text", async () => {
    const headers = { [INSTALL_ID_HEADER]: randomUUID() };
    const at = new Date().toISOString();
    const ok = await app.inject({ method: "POST", url: "/events", headers, payload: { events: [{ name: "screen", props: { route: "/money" }, at }, { name: "place_opened", props: { place: "daftar", via: "tap" }, at: "2020-01-01T00:00:00.000Z" }] } });
    expect(ok.statusCode).toBe(204);
    const rows = await prisma.event.findMany({ where: { name: { startsWith: "app:" } }, orderBy: { name: "asc" } });
    expect(rows.map((r) => r.name)).toEqual(["app:place_opened", "app:screen"]);
    // A wrong phone clock is clamped to the last week.
    expect(Date.now() - rows[0]!.createdAt.getTime()).toBeLessThanOrEqual(7 * 86_400_000 + 1000);
    expect((await app.inject({ method: "POST", url: "/events", headers, payload: { events: [{ name: "chat_text", props: {}, at }] } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/events", headers, payload: { events: [{ name: "screen", props: { route: "x".repeat(200) }, at }] } })).statusCode).toBe(400);
  });
});
