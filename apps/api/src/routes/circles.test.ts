import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AcceptInviteResponse, CircleResponse, CreateInviteResponse, INSTALL_ID_HEADER, InvitePreview, ListCirclesResponse } from "@fakkarni/shared";
import { buildApp } from "../app";
import { MAX_CIRCLE_MEMBERS } from "../circles/rules";
import { hasTestDb, resetDb, testPrisma } from "../../test/db";
import { renderInvitePage } from "./invite-page";

const SECRET = "test-secret-at-least-32-characters-long!!";
const token = (sub: string) =>
  new SignJWT({ role: "authenticated" }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setAudience("authenticated").setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

describe("invite page", () => {
  it("escapes names and shows the store button only when a store link is set", () => {
    const view = { kind: "confirmed" as const, inviter: "x", circle: "<b>Mona</b>", family: true, code: "ABCD2345" };
    const withStore = renderInvitePage(view, "en", { storeUrl: "https://play.google.com/store/apps/details?id=com.fakkarni.app", appScheme: "fakkarni" });
    expect(withStore).toContain("&lt;b&gt;Mona&lt;/b&gt;");
    expect(withStore).not.toContain("<b>Mona</b>");
    expect(withStore).toContain("Get Zaki");
    expect(withStore).toContain("fakkarni://invite/ABCD2345");
    expect(renderInvitePage(view, "ar", { appScheme: "fakkarni" })).toContain("نازل قريب");
    expect(renderInvitePage({ kind: "gone" }, "ar", { appScheme: "fakkarni" })).toContain('dir="rtl"');
  });
});

describe.skipIf(!hasTestDb)("circles and invites", () => {
  const prisma = testPrisma();
  let clock = new Date("2026-11-22T10:00:00Z");
  const app = buildApp(
    { logger: false },
    {
      prisma,
      now: () => clock,
      rateLimitPerMinute: false,
      auth: { supabaseJwtSecret: SECRET, allowInstallId: true },
      invites: { publicUrl: "https://zaki.test/", storeUrl: "https://play.google.com/store/apps/details?id=com.fakkarni.app" },
      billing: { requireSubscription: true },
    },
  );
  beforeEach(async () => {
    clock = new Date("2026-11-22T10:00:00Z");
    await resetDb(prisma);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  type H = Record<string, string>;
  const signedIn = async (name?: string): Promise<H> => {
    const h = { authorization: `Bearer ${await token(randomUUID())}` };
    if (name) await app.inject({ method: "PATCH", url: "/me", headers: h, payload: { name } });
    else await app.inject({ method: "GET", url: "/me", headers: h });
    return h;
  };
  const create = async (h: H, kind: "friends" | "family", name: string) =>
    CircleResponse.parse((await app.inject({ method: "POST", url: "/circles", headers: h, payload: { kind, name } })).json()).circle;
  const invite = async (h: H, circleId: string) => {
    const res = await app.inject({ method: "POST", url: `/circles/${circleId}/invites`, headers: h });
    expect(res.statusCode).toBe(201);
    return CreateInviteResponse.parse(res.json());
  };
  const accept = (h: H, code: string) => app.inject({ method: "POST", url: `/invites/${code}/accept`, headers: h });

  it("creates a circle, invites by link, and the friend joins after confirming on the web", async () => {
    const mona = await signedIn("منى");
    const circle = await create(mona, "family", "بيتنا");
    expect(circle).toMatchObject({ kind: "family", name: "بيتنا", role: "owner", member_count: 1 });

    const { invite: link, share_text } = await invite(mona, circle.id);
    expect(link.url).toBe(`https://zaki.test/i/${link.code}`);
    expect(share_text).toContain("«بيتنا»");
    expect(share_text.endsWith(link.url)).toBe(true);
    // Sharing again hands out the same live link.
    expect((await invite(mona, circle.id)).invite.code).toBe(link.code);

    // The web page: no account, Arabic by default, inviter and circle named.
    const page = await app.inject({ method: "GET", url: `/i/${link.code.toLowerCase()}` });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain("منى عازمك على «بيتنا»");
    expect(page.body).toContain(`/i/${link.code}/confirm`);
    expect(page.body).not.toContain("play.google.com");
    const confirmed = await app.inject({ method: "GET", url: `/i/${link.code}/confirm?lang=en` });
    expect(confirmed.body).toContain("One step left to join “بيتنا”");
    expect(confirmed.body).toContain("play.google.com");
    expect((await prisma.invite.findUniqueOrThrow({ where: { code: link.code } })).webConfirms).toBe(1);

    // In the app.
    const omar = await signedIn("عمر");
    const preview = InvitePreview.parse((await app.inject({ method: "GET", url: `/invites/${link.code}`, headers: omar })).json());
    expect(preview).toMatchObject({ circle_name: "بيتنا", circle_kind: "family", inviter_name: "منى", member_count: 1, state: "open" });
    const joined = AcceptInviteResponse.parse((await accept(omar, link.code)).json()).circle;
    expect(joined.role).toBe("member");
    expect(joined.members.map((m) => [m.name, m.role, m.is_me])).toEqual([["منى", "owner", false], ["عمر", "member", true]]);
    expect(joined.open_invites).toEqual([]); // Omar sees only his own links
    // Joining twice changes nothing.
    expect((await accept(omar, link.code)).statusCode).toBe(200);
    expect((await prisma.invite.findUniqueOrThrow({ where: { code: link.code } })).joins).toBe(1);
    expect(ListCirclesResponse.parse((await app.inject({ method: "GET", url: "/circles", headers: omar })).json()).circles).toHaveLength(1);

    // Mona earned 7 Pro days for bringing a new signed-in friend.
    const me = (await app.inject({ method: "GET", url: "/me", headers: mona })).json().user;
    expect(me.pro).toBe(true);
    expect(new Date(me.bonus_pro_until).toISOString()).toBe("2026-11-29T10:00:00.000Z");
  });

  it("keeps circles private to their members and lets only the owner rename, remove or delete", async () => {
    const owner = await signedIn("A");
    const member = await signedIn("B");
    const stranger = await signedIn("C");
    const circle = await create(owner, "friends", "Trip");
    await accept(member, (await invite(owner, circle.id)).invite.code);
    const memberId = (await app.inject({ method: "GET", url: "/me", headers: member })).json().user.id;

    expect((await app.inject({ method: "GET", url: `/circles/${circle.id}`, headers: stranger })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: `/circles/${circle.id}/invites`, headers: stranger })).statusCode).toBe(404);
    expect((await app.inject({ method: "PATCH", url: `/circles/${circle.id}`, headers: member, payload: { name: "x" } })).statusCode).toBe(403);
    expect((await app.inject({ method: "DELETE", url: `/circles/${circle.id}`, headers: member })).statusCode).toBe(403);
    expect((await app.inject({ method: "DELETE", url: `/circles/${circle.id}/members/${memberId}`, headers: stranger })).statusCode).toBe(404);
    expect((await app.inject({ method: "PATCH", url: `/circles/${circle.id}`, headers: owner, payload: { name: "Sahel trip" } })).json().circle.name).toBe("Sahel trip");

    // Any member can invite; removing them kills their links.
    const theirs = (await invite(member, circle.id)).invite.code;
    expect((await app.inject({ method: "DELETE", url: `/circles/${circle.id}/members/${memberId}`, headers: owner })).statusCode).toBe(204);
    expect((await accept(stranger, theirs)).json()).toEqual({ error: "expired" });
    expect((await app.inject({ method: "GET", url: `/i/${theirs}` })).statusCode).toBe(404);
    expect((await app.inject({ method: "DELETE", url: `/circles/${circle.id}`, headers: owner })).statusCode).toBe(204);
    expect(await prisma.circle.count()).toBe(0);
  });

  it("hands the circle to the next member when the owner leaves, and removes an empty circle", async () => {
    const owner = await signedIn("A");
    const member = await signedIn("B");
    const circle = await create(owner, "friends", "Flat");
    await accept(member, (await invite(owner, circle.id)).invite.code);
    const id = async (h: H) => (await app.inject({ method: "GET", url: "/me", headers: h })).json().user.id as string;
    await app.inject({ method: "DELETE", url: `/circles/${circle.id}/members/${await id(owner)}`, headers: owner });
    expect((await app.inject({ method: "GET", url: `/circles/${circle.id}`, headers: member })).json().circle.role).toBe("owner");
    await app.inject({ method: "DELETE", url: `/circles/${circle.id}/members/${await id(member)}`, headers: member });
    expect(await prisma.circle.count()).toBe(0);
  });

  it("refuses expired links and full circles, and rejects bad input", async () => {
    const owner = await signedIn("A");
    const circle = await create(owner, "friends", "Big");
    const code = (await invite(owner, circle.id)).invite.code;
    expect((await app.inject({ method: "POST", url: "/circles", headers: owner, payload: { kind: "work", name: "x" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/circles", headers: owner, payload: { kind: "family", name: "  " } })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/invites/ZZZZZZZZ", headers: owner })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `/invites/${code}`, headers: owner })).json().state).toBe("already_member");

    // Fill the circle.
    const users = await prisma.user.createManyAndReturn({ data: Array.from({ length: MAX_CIRCLE_MEMBERS - 1 }, () => ({ authId: `supabase:${randomUUID()}` })) });
    await prisma.circleMember.createMany({ data: users.map((u) => ({ circleId: circle.id, userId: u.id })) });
    const late = await signedIn("late");
    expect((await accept(late, code)).json()).toEqual({ error: "full" });
    expect((await app.inject({ method: "GET", url: `/i/${code}` })).statusCode).toBe(404);

    const other = await create(owner, "friends", "Small");
    const code2 = (await invite(owner, other.id)).invite.code;
    clock = new Date("2026-12-23T10:00:00Z");
    expect((await app.inject({ method: "GET", url: `/invites/${code2}`, headers: late })).json().state).toBe("expired");
    expect((await accept(late, code2)).statusCode).toBe(409);
    // A fresh link is issued once the old one has expired.
    expect((await invite(owner, other.id)).invite.code).not.toBe(code2);
  });

  it("gives no invite reward for friends who are not signed in or not new", async () => {
    const owner = await signedIn("A");
    const circle = await create(owner, "friends", "X");
    const code = (await invite(owner, circle.id)).invite.code;
    const guest = { [INSTALL_ID_HEADER]: randomUUID() };
    expect((await accept(guest, code)).statusCode).toBe(200);
    const old = await signedIn("old");
    await prisma.user.updateMany({ where: { name: "old" }, data: { createdAt: new Date("2026-10-01T00:00:00Z") } });
    expect((await accept(old, code)).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/me", headers: owner })).json().user.bonus_pro_until).toBeNull();
    expect((await app.inject({ method: "GET", url: `/circles/${circle.id}`, headers: owner })).json().circle.member_count).toBe(3);
  });

  it("shares a Family plan with the first six people in the payer's family circle", async () => {
    const payer = await signedIn("بابا");
    const circle = await create(payer, "family", "العيلة");
    const code = (await invite(payer, circle.id)).invite.code;
    const kids: H[] = [];
    for (let i = 0; i < 6; i++) {
      clock = new Date(clock.getTime() + 60_000);
      const kid = await signedIn(`kid${i}`);
      await accept(kid, code);
      kids.push(kid);
    }
    // Take away the invite days so only the Family plan can give Pro.
    await prisma.user.updateMany({ data: { bonusProUntil: null, createdAt: new Date("2026-10-01T00:00:00Z") } });
    const pro = async (h: H) => (await app.inject({ method: "GET", url: "/me", headers: h })).json().user.pro as boolean;
    expect(await pro(kids[0]!)).toBe(false);

    await prisma.user.updateMany({ where: { name: "بابا" }, data: { plan: "monthly", planTier: "family", planExpiresAt: new Date("2027-01-01T00:00:00Z") } });
    expect(await pro(payer)).toBe(true);
    for (const kid of kids.slice(0, 5)) expect(await pro(kid)).toBe(true);
    expect(await pro(kids[5]!)).toBe(false); // the seventh person

    // Covered members chat without the free limit.
    const send = (h: H) => app.inject({ method: "POST", url: "/messages", headers: h, payload: { client_id: randomUUID(), text: "hello", created_at: clock.toISOString() } });
    expect((await send(kids[0]!)).statusCode).toBe(201);

    // Six people per payer in all, not per circle: joining another family circle covers nobody new.
    const other = await signedIn("other");
    const second = await create(other, "family", "عيلة تانية");
    clock = new Date(clock.getTime() + 60_000);
    await accept(payer, (await invite(other, second.id)).invite.code);
    await prisma.user.updateMany({ where: { name: "other" }, data: { bonusProUntil: null, createdAt: new Date("2026-10-01T00:00:00Z") } });
    expect(await pro(other)).toBe(false);
    expect(await pro(kids[4]!)).toBe(true);

    // A Pro (not Family) payer covers nobody else, and a friends circle is never covered.
    await prisma.user.updateMany({ where: { name: "بابا" }, data: { planTier: "pro" } });
    expect(await pro(kids[0]!)).toBe(false);
  });

  it("hands owned circles on and removes the user's circle posts when they delete their account", async () => {
    const owner = await signedIn("owner");
    const member = await signedIn("member");
    const circle = await create(owner, "family", "بيتنا");
    const solo = await create(owner, "friends", "لوحدي");
    clock = new Date(clock.getTime() + 60_000);
    await accept(member, (await invite(owner, circle.id)).invite.code);
    const ownerId = (await prisma.user.findFirstOrThrow({ where: { name: "owner" } })).id;
    await prisma.circlePost.create({ data: { circleId: circle.id, event: "checkin:ok", actorId: ownerId, title: "وصلت المستشفى" } });

    expect((await app.inject({ method: "DELETE", url: "/me", headers: owner })).statusCode).toBe(204);
    const memberId = (await prisma.user.findFirstOrThrow({ where: { name: "member" } })).id;
    expect((await prisma.circleMember.findUniqueOrThrow({ where: { circleId_userId: { circleId: circle.id, userId: memberId } } })).role).toBe("owner");
    expect(await prisma.circle.findUnique({ where: { id: solo.id } })).toBeNull();
    expect(await prisma.circlePost.count({ where: { actorId: ownerId } })).toBe(0);
    expect((await app.inject({ method: "PATCH", url: `/circles/${circle.id}`, headers: member, payload: { name: "بيتنا الجديد" } })).statusCode).toBe(200);
  });

  it("keeps circles when a phone's data is linked to an account", async () => {
    const installId = randomUUID();
    const guest = { [INSTALL_ID_HEADER]: installId };
    const circle = await create(guest, "friends", "Mine");
    const sub = randomUUID();
    const account = { authorization: `Bearer ${await token(sub)}` };
    await app.inject({ method: "GET", url: "/me", headers: account });
    expect((await app.inject({ method: "POST", url: "/auth/link", headers: { ...account, [INSTALL_ID_HEADER]: installId } })).statusCode).toBe(200);
    const mine = ListCirclesResponse.parse((await app.inject({ method: "GET", url: "/circles", headers: account })).json()).circles;
    expect(mine).toMatchObject([{ id: circle.id, role: "owner" }]);
  });
});
