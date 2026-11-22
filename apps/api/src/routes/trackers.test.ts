import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ExportResponse, ListTrackersResponse, MeResponse, TrackerResponse } from "@fakkarni/shared";
import { buildApp } from "../app";
import { trackerFastPath } from "../trackers/store";
import { hasTestDb, resetDb, testPrisma } from "../../test/db";

const SECRET = "test-secret-at-least-32-characters-long!!";
const token = (sub: string) =>
  new SignJWT({ role: "authenticated" }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setAudience("authenticated").setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

describe.skipIf(!hasTestDb)("trackers", () => {
  const prisma = testPrisma();
  let clock = new Date("2026-11-22T10:00:00Z");
  const app = buildApp({ logger: false }, { prisma, now: () => clock, rateLimitPerMinute: false, auth: { supabaseJwtSecret: SECRET, allowInstallId: true } });
  beforeEach(async () => {
    await resetDb(prisma);
    clock = new Date("2026-11-22T10:00:00Z");
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  type H = Record<string, string>;
  const signedIn = async (): Promise<{ h: H; id: string }> => {
    const h = { authorization: `Bearer ${await token(randomUUID())}` };
    const res = await app.inject({ method: "PATCH", url: "/me", headers: h, payload: { name: "منى" } });
    return { h, id: MeResponse.parse(res.json()).user.id };
  };
  const post = (h: H, url: string, payload?: object) => app.inject({ method: "POST", url, headers: h, ...(payload ? { payload } : {}) });
  const list = async (h: H) => ListTrackersResponse.parse((await app.inject({ method: "GET", url: "/trackers", headers: h })).json());
  const user = (id: string) => prisma.user.findUniqueOrThrow({ where: { id } });

  it("gives a free user one tracker, counts taps in local days, and can undo", async () => {
    const { h } = await signedIn();
    const made = await post(h, "/trackers", { kind: "water" });
    expect(made.statusCode).toBe(201);
    const water = TrackerResponse.parse(made.json()).tracker;
    expect(water).toMatchObject({ kind: "water", unit: "count", goal: 8, today: 0, streak: 0, total: 0 });

    // The second one needs Pro.
    const second = await post(h, "/trackers", { kind: "gym" });
    expect(second.statusCode).toBe(402);
    expect(second.json()).toEqual({ error: "tracker_limit" });
    expect(await list(h)).toMatchObject({ limit: 1, trackers: [{ id: water.id }] });

    // Yesterday (Cairo): the goal is met with one typed amount. Today: two taps.
    clock = new Date("2026-11-21T12:00:00Z");
    expect(TrackerResponse.parse((await post(h, `/trackers/${water.id}/entries`, { amount: 8 })).json()).tracker.today).toBe(8);
    clock = new Date("2026-11-22T10:00:00Z");
    await post(h, `/trackers/${water.id}/entries`);
    const now = TrackerResponse.parse((await post(h, `/trackers/${water.id}/entries`)).json()).tracker;
    expect(now).toMatchObject({ today: 2, total: 10, streak: 1 });
    expect(now.week).toEqual([0, 0, 0, 0, 0, 8, 2]);

    expect(TrackerResponse.parse((await post(h, `/trackers/${water.id}/undo`)).json()).tracker.today).toBe(1);
    expect((await post(h, `/trackers/${water.id}/entries`, { amount: -1 })).statusCode).toBe(400);

    // Deleting it frees the slot.
    expect((await app.inject({ method: "DELETE", url: `/trackers/${water.id}`, headers: h })).statusCode).toBe(204);
    expect((await post(h, "/trackers", { kind: "gym" })).statusCode).toBe(201);
  });

  it("lifts the limit for Pro, and keeps other people's trackers private", async () => {
    const { h, id } = await signedIn();
    await prisma.user.update({ where: { id }, data: { bonusProUntil: new Date("2026-12-01T00:00:00Z") } });
    expect((await post(h, "/trackers", { kind: "water" })).statusCode).toBe(201);
    const custom = await post(h, "/trackers", { kind: "custom", name: "مشي الكلب" });
    expect(TrackerResponse.parse(custom.json()).tracker).toMatchObject({ kind: "custom", name: "مشي الكلب", goal: 1 });
    expect((await post(h, "/trackers", { kind: "custom" })).statusCode).toBe(400);
    expect((await list(h)).limit).toBeNull();

    const other = await signedIn();
    const theirs = TrackerResponse.parse(custom.json()).tracker.id;
    expect((await post(other.h, `/trackers/${theirs}/entries`)).statusCode).toBe(404);
    expect((await app.inject({ method: "DELETE", url: `/trackers/${theirs}`, headers: other.h })).statusCode).toBe(404);
  });

  it("logs from chat by rules, starts a tracker on request, and offers Pro at the limit", async () => {
    const { h, id } = await signedIn();
    // Nothing followed yet: the message is not ours to answer.
    expect(await trackerFastPath(prisma, await user(id), "شربت مية", "arabic", clock)).toBeNull();

    const started = await trackerFastPath(prisma, await user(id), "تابع معايا المية", "arabic", clock);
    expect(started).toMatchObject({ upsell: false });
    expect(started!.text).toContain("بدأت أتابع معاك المية 💧");
    expect((await trackerFastPath(prisma, await user(id), "track my water", "english", clock))!.text).toContain("already following water 💧");

    const logged = await trackerFastPath(prisma, await user(id), "شربت كوبايتين مية", "arabic", clock);
    expect(logged!.text).toBe("اتسجلت في المية 💧 2 من 8 النهارده. كمّل كده 🌟");
    const done = await trackerFastPath(prisma, await user(id), "drank 6 cups of water", "english", clock);
    expect(done!.text).toBe("Yes! Today's goal is done for water 💧 (8 of 8) 🎉");
    expect((await list(h)).trackers[0]).toMatchObject({ today: 8, streak: 1 });

    const more = await trackerFastPath(prisma, await user(id), "عايز اتابع مصاريفي", "arabic", clock);
    expect(more).toMatchObject({ upsell: true });
    expect((await list(h)).trackers).toHaveLength(1);
    // A kind they do not follow goes to Zaki as a normal message.
    expect(await trackerFastPath(prisma, await user(id), "صرفت 300 على البقالة", "arabic", clock)).toBeNull();
  });

  it("keeps running totals for money trackers", async () => {
    const { h, id } = await signedIn();
    await prisma.user.update({ where: { id }, data: { bonusProUntil: new Date("2026-12-01T00:00:00Z") } });
    const savings = TrackerResponse.parse((await post(h, "/trackers", { kind: "savings", goal: 5000 })).json()).tracker;
    expect(savings).toMatchObject({ unit: "money", goal: 5000, cumulative: true });
    // Money needs an amount: a bare tap is refused.
    expect((await post(h, `/trackers/${savings.id}/entries`)).statusCode).toBe(400);
    const line = await trackerFastPath(prisma, await user(id), "حوشت 500", "arabic", clock);
    expect(line!.text).toBe("سجّلت 500 جنيه في التحويش 🐷 المجموع لحد دلوقتي 500 من 5,000. كل جنيه بيفرق 🌟");
    expect((await list(h)).trackers[0]).toMatchObject({ total: 500, streak: 0 });
    // The data export carries trackers and their entries.
    const exp = ExportResponse.parse((await app.inject({ method: "GET", url: "/me/export", headers: h })).json());
    expect(exp.trackers).toMatchObject([{ kind: "savings", goal: 5000, entries: [{ amount: 500, source: "chat" }] }]);
  });
});
