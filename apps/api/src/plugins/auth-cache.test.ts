import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { SignJWT } from "jose";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { INSTALL_ID_HEADER } from "@fakkarni/shared";
import { buildApp } from "../app";
import type { PrismaClient, User } from "../generated/prisma/client";
import { hasTestDb, resetDb, testPrisma } from "../../test/db";
import { forgetCachedUser, forgetCachedUserId, installAuthId, requireUser } from "./auth";

const SECRET = "test-secret-test-secret-test-secret";
const token = (sub: string) =>
  new SignJWT({ role: "authenticated" }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setAudience("authenticated").setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

/**
 * Reads reuse the caller's user row for a few seconds (USER_CACHE_MS). What must hold: the
 * caller always sees their own writes at once, and a row changed by a route for someone else
 * is dropped too.
 */
describe.skipIf(!hasTestDb)("user row cache", () => {
  const prisma = testPrisma();
  let a = randomUUID();
  let b = randomUUID();
  const app = buildApp({ logger: false }, { prisma, userCacheMs: 60_000, rateLimitPerMinute: false, auth: { supabaseJwtSecret: SECRET, allowInstallId: true } });
  const call = (who: string, method: "GET" | "PATCH" | "POST" | "DELETE", url: string, payload?: object) => app.inject({ method, url, headers: { [INSTALL_ID_HEADER]: who }, ...(payload ? { payload } : {}) });

  beforeEach(async () => {
    // A cached row must never outlive its user: fresh people for every test.
    forgetCachedUser(installAuthId(a));
    forgetCachedUser(installAuthId(b));
    a = randomUUID();
    b = randomUUID();
    await resetDb(prisma);
  });
  afterAll(() => prisma.$disconnect());

  it("serves reads from the saved row, without asking the database again", async () => {
    const first = (await call(a, "GET", "/me")).json().user;
    // Changed behind the API's back: a read inside the cache time still shows the saved row.
    await prisma.user.update({ where: { id: first.id }, data: { name: "Changed elsewhere" } });
    expect((await call(a, "GET", "/me")).json().user.name).toBeNull();
  });

  it("shows the caller their own change on the very next read", async () => {
    await call(a, "GET", "/me");
    expect((await call(a, "PATCH", "/me", { name: "Mona", language: "en" })).statusCode).toBe(200);
    const me = (await call(a, "GET", "/me")).json().user;
    expect(me.name).toBe("Mona");
    expect(me.language).toBe("en");
  });

  it("never uses the saved row for a write", async () => {
    const me = (await call(a, "GET", "/me")).json().user;
    await prisma.user.update({ where: { id: me.id }, data: { timezone: "Asia/Dubai" } });
    // PATCH reads the row itself, so its answer carries what is in the database now.
    const patched = (await call(a, "PATCH", "/me", { name: "Mona" })).json().user;
    expect(patched.timezone).toBe("Asia/Dubai");
  });

  it("keeps one referral code across reads", async () => {
    await call(a, "GET", "/me");
    const one = (await call(a, "GET", "/me/referral")).json().code;
    const two = (await call(a, "GET", "/me/referral")).json().code;
    expect(one).toBeTruthy();
    expect(two).toBe(one);
  });

  it("drops the inviter's saved row when a friend's claim gives them Pro days", async () => {
    const inviter = (await call(a, "GET", "/me")).json().user;
    expect(inviter.pro).toBe(false);
    const code = (await call(a, "GET", "/me/referral")).json().code;
    await call(a, "GET", "/me"); // saved again, still without Pro days
    // The friend must be signed in to claim.
    const friend = { authorization: `Bearer ${await token(randomUUID())}` };
    const claim = await app.inject({ method: "POST", url: "/referrals/claim", headers: friend, payload: { code } });
    expect(claim.statusCode).toBe(200);
    expect((await call(a, "GET", "/me")).json().user.pro).toBe(true);
  });

  it("starts fresh after the account is deleted", async () => {
    const before = (await call(a, "GET", "/me")).json().user;
    expect((await call(a, "DELETE", "/me")).statusCode).toBe(204);
    const after = (await call(a, "GET", "/me")).json().user;
    expect(after.id).not.toBe(before.id);
  });
});

/**
 * A read that is still looking the row up when a write drops it may have read the row as it
 * was before that write: it must not save what it found.
 */
describe("user row cache: a read in flight", () => {
  function setup() {
    const install = randomUUID();
    const authId = installAuthId(install);
    const state = { row: { id: randomUUID(), authId, name: null, lastActiveAt: new Date() } as unknown as User, hold: false };
    const waiting: (() => void)[] = [];
    const prisma = {
      user: {
        findUnique: async () => {
          const seen = state.row;
          if (state.hold) await new Promise<void>((go) => waiting.push(go));
          return seen;
        },
        upsert: async () => state.row,
        update: async () => state.row,
      },
    } as unknown as PrismaClient;
    const auth = requireUser(prisma, { allowInstallId: true }, null, 60_000);
    const get = () => ({ method: "GET", headers: { [INSTALL_ID_HEADER]: install } }) as unknown as FastifyRequest;
    const run = (req: FastifyRequest) => auth(req, {} as FastifyReply);
    return { authId, state, release: () => waiting.splice(0).forEach((go) => go()), get, run };
  }

  it("does not save the row when the caller's own write was answered meanwhile", async () => {
    const t = setup();
    t.state.hold = true;
    const slow = t.get();
    const reading = t.run(slow); // sees the row as it is now, then waits for the database
    t.state.hold = false;
    t.state.row = { ...t.state.row, name: "Mona" };
    forgetCachedUser(t.authId); // the write is answered
    t.release();
    await reading;
    expect(slow.user.name).toBeNull();
    const next = t.get();
    await t.run(next);
    expect(next.user.name).toBe("Mona");
  });

  it("does not save the row when a route changed it for them meanwhile", async () => {
    const t = setup();
    t.state.hold = true;
    const slow = t.get();
    const reading = t.run(slow);
    t.state.hold = false;
    t.state.row = { ...t.state.row, name: "Now Pro" };
    forgetCachedUserId(t.state.row.id);
    t.release();
    await reading;
    const next = t.get();
    await t.run(next);
    expect(next.user.name).toBe("Now Pro");
  });

  it("still saves the row when nothing happened meanwhile", async () => {
    const t = setup();
    await t.run(t.get());
    t.state.row = { ...t.state.row, name: "Changed elsewhere" };
    const next = t.get();
    await t.run(next);
    expect(next.user.name).toBeNull();
    forgetCachedUser(t.authId);
  });
});
