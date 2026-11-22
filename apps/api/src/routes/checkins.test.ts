import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { checkinOrder, CircleFeedResponse, CircleResponse, CreateInviteResponse, ExportResponse, ListCirclesResponse, ListMessagesResponse, MeResponse } from "@fakkarni/shared";
import { buildApp } from "../app";
import type { PushMessage } from "../proactive/push";
import { hasTestDb, resetDb, testPrisma } from "../../test/db";

const SECRET = "test-secret-at-least-32-characters-long!!";
const token = (sub: string) =>
  new SignJWT({ role: "authenticated" }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setAudience("authenticated").setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

describe.skipIf(!hasTestDb)("check-ins and family roles", () => {
  const prisma = testPrisma();
  let clock = new Date("2026-11-22T10:00:00Z");
  const pushed: PushMessage[] = [];
  const app = buildApp(
    { logger: false },
    {
      prisma,
      now: () => clock,
      rateLimitPerMinute: false,
      auth: { supabaseJwtSecret: SECRET, allowInstallId: true },
      invites: { publicUrl: "https://zaki.test" },
      push: async (messages) => {
        pushed.push(...messages);
        return { invalidTokens: [], sent: messages.length };
      },
    },
  );
  beforeEach(async () => {
    await resetDb(prisma);
    clock = new Date("2026-11-22T10:00:00Z");
    pushed.length = 0;
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  type P = { h: Record<string, string>; id: string };
  const signedIn = async (name: string, extra: object = {}): Promise<P> => {
    const h = { authorization: `Bearer ${await token(randomUUID())}` };
    const res = await app.inject({ method: "PATCH", url: "/me", headers: h, payload: { name, ...extra } });
    const id = MeResponse.parse(res.json()).user.id;
    await prisma.device.create({ data: { userId: id, platform: "android", pushToken: `ExponentPushToken[${id}]` } });
    return { h, id };
  };
  const family = async (owner: P, payload: object, ...others: P[]) => {
    const res = await app.inject({ method: "POST", url: "/circles", headers: owner.h, payload: { kind: "family", name: "البيت", ...payload } });
    const circle = CircleResponse.parse(res.json()).circle;
    const { invite } = CreateInviteResponse.parse((await app.inject({ method: "POST", url: `/circles/${circle.id}/invites`, headers: owner.h })).json());
    for (const o of others) await app.inject({ method: "POST", url: `/invites/${invite.code}/accept`, headers: o.h });
    return circle;
  };
  const flush = () => new Promise((r) => setTimeout(r, 50));

  it("orders check-in buttons for the kind of family", () => {
    expect(checkinOrder("adults_elders")[0]).toBe("medicine");
    expect(checkinOrder("spouses")[0]).toBe("on_way");
    expect(checkinOrder("parents_teens")[0]).toBe("arrived");
    expect(checkinOrder(null)).toHaveLength(5);
  });

  it("keeps the family type and each member's role", async () => {
    const mona = await signedIn("منى");
    const omar = await signedIn("عمر");
    const circle = await family(mona, { family_type: "parents_teens" }, omar);
    expect(circle.family_type).toBe("parents_teens");
    expect(ListCirclesResponse.parse((await app.inject({ method: "GET", url: "/circles", headers: omar.h })).json()).circles[0]!.family_type).toBe("parents_teens");

    const patch = (who: P, target: P, family_role: string | null) => app.inject({ method: "PATCH", url: `/circles/${circle.id}/members/${target.id}`, headers: who.h, payload: { family_role } });
    // Each person sets their own; only the owner may set someone else's.
    expect((await patch(omar, omar, "teen")).statusCode).toBe(200);
    expect((await patch(omar, mona, "teen")).statusCode).toBe(403);
    const after = CircleResponse.parse((await patch(mona, mona, "parent")).json()).circle;
    expect(after.members.map((m) => [m.name, m.family_role])).toEqual([["منى", "parent"], ["عمر", "teen"]]);
    expect((await patch(mona, omar, "king")).statusCode).toBe(400);

    // The owner can change the family type; a friends circle never gets one.
    const changed = await app.inject({ method: "PATCH", url: `/circles/${circle.id}`, headers: mona.h, payload: { family_type: "mixed" } });
    expect(CircleResponse.parse(changed.json()).circle).toMatchObject({ family_type: "mixed", name: "البيت" });
    const friends = await app.inject({ method: "POST", url: "/circles", headers: mona.h, payload: { kind: "friends", name: "الشلة", family_type: "spouses" } });
    expect(CircleResponse.parse(friends.json()).circle.family_type).toBeNull();
  });

  it("shares a one-tap check-in with the circle, in each reader's language", async () => {
    const mona = await signedIn("منى");
    const dad = await signedIn("بابا");
    const omar = await signedIn("Omar", { language: "en" });
    const circle = await family(mona, { family_type: "adults_elders" }, dad, omar);

    const res = await app.inject({ method: "POST", url: `/circles/${circle.id}/checkins`, headers: dad.h, payload: { kind: "medicine", note: "بتاع الضغط" } });
    expect(res.statusCode).toBe(201);
    const mine = CircleResponse.parse(res.json()).circle.members.find((m) => m.is_me)!;
    expect(mine.last_checkin).toMatchObject({ kind: "medicine", note: "بتاع الضغط", at: "2026-11-22T10:00:00.000Z" });

    await flush();
    // The others get a push; the person who checked in does not.
    expect(pushed.map((p) => p.to).sort()).toEqual([`ExponentPushToken[${mona.id}]`, `ExponentPushToken[${omar.id}]`].sort());
    expect(pushed.find((p) => p.to.includes(mona.id))!.body).toBe("البيت: بابا: خدت الدوا 💊 (بتاع الضغط)");
    expect(pushed.find((p) => p.to.includes(omar.id))!.body).toBe("البيت: بابا: I took my medicine 💊 (بتاع الضغط)");

    const feed = CircleFeedResponse.parse((await app.inject({ method: "GET", url: `/circles/${circle.id}/feed`, headers: mona.h })).json());
    expect(feed.posts.map((p) => p.text)).toEqual(["بابا: خدت الدوا 💊 (بتاع الضغط)"]);
    const seen = CircleResponse.parse((await app.inject({ method: "GET", url: `/circles/${circle.id}`, headers: mona.h })).json()).circle;
    expect(seen.members.find((m) => m.name === "بابا")!.last_checkin).toMatchObject({ kind: "medicine" });
    expect(seen.members.find((m) => m.is_me)!.last_checkin).toBeNull();

    // It is his data: it is in his export, and not in anyone else's.
    expect(ExportResponse.parse((await app.inject({ method: "GET", url: "/me/export", headers: dad.h })).json()).checkins).toMatchObject([{ kind: "medicine", note: "بتاع الضغط" }]);
    expect(ExportResponse.parse((await app.inject({ method: "GET", url: "/me/export", headers: mona.h })).json()).checkins).toEqual([]);

    const stranger = await signedIn("غريب");
    expect((await app.inject({ method: "POST", url: `/circles/${circle.id}/checkins`, headers: stranger.h, payload: { kind: "ok" } })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: `/circles/${circle.id}/checkins`, headers: dad.h, payload: { kind: "location" } })).statusCode).toBe(400);
  });

  it("passes on 'check in please' at most once every three hours per pair", async () => {
    const mona = await signedIn("منى");
    const dad = await signedIn("بابا");
    const circle = await family(mona, {}, dad);
    const ask = (who: P, target: P) => app.inject({ method: "POST", url: `/circles/${circle.id}/members/${target.id}/ask-checkin`, headers: who.h });

    expect((await ask(mona, dad)).statusCode).toBe(204);
    const chat = ListMessagesResponse.parse((await app.inject({ method: "GET", url: "/messages", headers: { ...dad.h, "x-message-kinds": "2" } })).json()).messages;
    expect(chat.at(-1)).toMatchObject({ role: "friend", kind: "update", text: "طمّن منى عليك. دوسة واحدة في «البيت» كفاية 💛" });
    await flush();
    expect(pushed).toHaveLength(1);

    expect((await ask(mona, dad)).statusCode).toBe(409);
    expect((await ask(mona, mona)).statusCode).toBe(400);
    // The other direction is a different pair.
    expect((await ask(dad, mona)).statusCode).toBe(204);
    clock = new Date("2026-11-22T15:00:00Z");
    expect((await ask(mona, dad)).statusCode).toBe(204);
  });
});
