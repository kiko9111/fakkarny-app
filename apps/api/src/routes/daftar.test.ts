import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { CircleResponse, CreateInviteResponse, DaftarResponse, ListDaftarResponse, ListMessagesResponse } from "@fakkarni/shared";
import { buildApp } from "../app";
import { hasTestDb, resetDb, testPrisma } from "../../test/db";

const SECRET = "test-secret-at-least-32-characters-long!!";
const token = (sub: string) =>
  new SignJWT({ role: "authenticated" }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setAudience("authenticated").setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));
const PAY = "https://ipn.eg/S/mona.ali/instapay/8DbD6Q";

describe.skipIf(!hasTestDb)("shared Daftar", () => {
  const prisma = testPrisma();
  const clock = new Date("2026-11-22T10:00:00Z");
  const app = buildApp(
    { logger: false },
    { prisma, now: () => clock, rateLimitPerMinute: false, auth: { supabaseJwtSecret: SECRET, allowInstallId: true }, invites: { publicUrl: "https://zaki.test", storeUrl: "https://play.google.com/store/apps/details?id=com.fakkarni.app" } },
  );
  beforeEach(() => resetDb(prisma));
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  type H = Record<string, string>;
  const signedIn = async (name: string, extra: object = {}): Promise<H> => {
    const h = { authorization: `Bearer ${await token(randomUUID())}` };
    expect((await app.inject({ method: "PATCH", url: "/me", headers: h, payload: { name, ...extra } })).statusCode).toBe(200);
    return h;
  };
  const create = async (h: H, payload: object) => {
    const res = await app.inject({ method: "POST", url: "/daftar", headers: h, payload });
    expect(res.statusCode).toBe(201);
    return DaftarResponse.parse(res.json());
  };
  const list = async (h: H) => ListDaftarResponse.parse((await app.inject({ method: "GET", url: "/daftar", headers: h })).json()).entries;
  const chat = async (h: H) => ListMessagesResponse.parse((await app.inject({ method: "GET", url: "/messages", headers: { ...h, "x-message-kinds": "2" } })).json()).messages;
  const form = { "content-type": "application/x-www-form-urlencoded" };
  const codeOf = (url: string | null) => url!.split("/d/")[1]!;

  it("sends a debt as a link, the other person confirms on the web, and Zaki tells the creator", async () => {
    const mona = await signedIn("منى", { instapay_link: `my link ${PAY}` });
    const { entry, share_text } = await create(mona, { other_name: "أحمد", direction: "owed_to_me", amount: 200, note: "العشا" });
    expect(entry).toMatchObject({ other_name: "أحمد", direction: "owed_to_me", amount: 200, currency: "EGP", status: "pending", mine: true, pay_link: null });
    expect(entry.url).toMatch(/^https:\/\/zaki\.test\/d\/[A-Z2-9]{8}$/);
    expect(share_text).toContain("200 جنيه");
    expect(share_text!.endsWith(entry.url!)).toBe(true);
    const code = codeOf(entry.url);

    // Opening the link (or a preview crawler fetching it) changes nothing.
    const page = await app.inject({ method: "GET", url: `/d/${code}` });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain("منى سجّل إن عليك ليه");
    expect(page.body).toContain("200 جنيه");
    expect(page.body).toContain("العشا");
    expect(page.body).not.toContain("ipn.eg");
    expect((await list(mona))[0]!.status).toBe("pending");
    // Zaki reminds the other person only after they confirmed: while pending, "share" is the confirm link.
    expect((await app.inject({ method: "POST", url: `/daftar/${entry.id}/share`, headers: mona })).json().share_text).toBe(share_text);

    const done = await app.inject({ method: "POST", url: `/d/${code}/confirm?lang=ar`, headers: form, payload: "" });
    expect(done.statusCode).toBe(303);
    expect(done.headers.location).toBe(`/d/${code}?lang=ar`);
    const after = await app.inject({ method: "GET", url: `/d/${code}` });
    expect(after.body).toContain("اتسجلت عندكم انتو الاتنين");
    expect(after.body).toContain(PAY); // the visitor owes Mona, so her InstaPay link is offered
    expect(after.body).toContain("fakkarni://daftar/");
    // A second answer is ignored.
    await app.inject({ method: "POST", url: `/d/${code}/dispute`, headers: form, payload: "" });
    expect((await list(mona))[0]).toMatchObject({ status: "confirmed" });

    const updates = (await chat(mona)).filter((m) => m.kind === "update");
    expect(updates).toHaveLength(1);
    expect(updates[0]!.text).toContain("أحمد أكّد الـ200 جنيه");

    // Now a kind nudge is allowed.
    const nudge = await app.inject({ method: "POST", url: `/daftar/${entry.id}/share`, headers: mona });
    expect(nudge.json().share_text).toContain("من غير أي ضغط");
  });

  it("shows the entry to the other person in the app, from their side, and lets either settle", async () => {
    const mona = await signedIn("منى", { instapay_link: PAY });
    const ahmed = await signedIn("أحمد");
    const stranger = await signedIn("غريب");
    const { entry } = await create(mona, { other_name: "أحمد", direction: "owed_to_me", amount: 350.5 });
    const code = codeOf(entry.url);

    expect((await app.inject({ method: "POST", url: `/daftar/open/${code}`, headers: mona })).json().entry.mine).toBe(true);
    const opened = DaftarResponse.parse((await app.inject({ method: "POST", url: `/daftar/open/${code.toLowerCase()}`, headers: ahmed })).json()).entry;
    expect(opened).toMatchObject({ other_name: "منى", direction: "i_owe", amount: 350.5, mine: false, url: null, pay_link: PAY, status: "pending" });
    // Only the first account to open it gets it.
    expect((await app.inject({ method: "POST", url: `/daftar/open/${code}`, headers: stranger })).statusCode).toBe(404);
    expect(await list(stranger)).toEqual([]);
    for (const path of ["respond", "settle", "share", "cancel"]) {
      expect((await app.inject({ method: "POST", url: `/daftar/${entry.id}/${path}`, headers: stranger, payload: { answer: "confirm" } })).statusCode).toBe(404);
    }

    // The creator can't answer their own entry; the other person can't cancel it.
    expect((await app.inject({ method: "POST", url: `/daftar/${entry.id}/respond`, headers: mona, payload: { answer: "confirm" } })).statusCode).toBe(409);
    expect((await app.inject({ method: "POST", url: `/daftar/${entry.id}/cancel`, headers: ahmed })).statusCode).toBe(409);
    expect((await app.inject({ method: "POST", url: `/daftar/${entry.id}/respond`, headers: ahmed, payload: { answer: "confirm" } })).json().entry.status).toBe("confirmed");
    expect((await list(mona))[0]!.other_name).toBe("أحمد");

    expect((await app.inject({ method: "POST", url: `/daftar/${entry.id}/settle`, headers: ahmed })).json().entry).toMatchObject({ status: "settled", pay_link: null });
    expect((await app.inject({ method: "POST", url: `/daftar/${entry.id}/settle`, headers: mona })).statusCode).toBe(409);
    const texts = (await chat(mona)).filter((m) => m.kind === "update").map((m) => m.text);
    expect(texts.some((t) => t.includes("اتقفلت"))).toBe(true);
    expect((await app.inject({ method: "GET", url: `/d/${code}?lang=en` })).body).toContain("already settled");
  });

  it("handles a dispute and a cancel, and a debt the creator owes", async () => {
    const mona = await signedIn("Mona");
    await app.inject({ method: "PATCH", url: "/me", headers: mona, payload: { language: "en" } });
    const { entry, share_text } = await create(mona, { other_name: "Ali", direction: "i_owe", amount: 90 });
    expect(share_text).toContain("the EGP 90 I owe you");
    const code = codeOf(entry.url);
    const page = await app.inject({ method: "GET", url: `/d/${code}?lang=en` });
    expect(page.body).toContain("Mona noted that they owe you");
    await app.inject({ method: "POST", url: `/d/${code}/dispute?lang=en`, headers: form, payload: "" });
    expect((await list(mona))[0]!.status).toBe("disputed");
    expect((await chat(mona)).find((m) => m.kind === "update")!.text).toContain("doesn't look right");
    expect((await app.inject({ method: "POST", url: `/daftar/${entry.id}/share`, headers: mona })).statusCode).toBe(409);
    expect((await app.inject({ method: "POST", url: `/daftar/${entry.id}/cancel`, headers: mona })).statusCode).toBe(204);
    expect(await list(mona)).toEqual([]);
    expect((await app.inject({ method: "GET", url: `/d/${code}` })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: `/d/${code}/confirm`, headers: form, payload: "" })).statusCode).toBe(404);
  });

  it("sends an entry straight to a circle member and tells them in their chat", async () => {
    const mona = await signedIn("منى");
    const omar = await signedIn("عمر");
    const outsider = await signedIn("برّه");
    const circle = CircleResponse.parse((await app.inject({ method: "POST", url: "/circles", headers: mona, payload: { kind: "friends", name: "الشلة" } })).json()).circle;
    const invite = CreateInviteResponse.parse((await app.inject({ method: "POST", url: `/circles/${circle.id}/invites`, headers: mona })).json()).invite;
    await app.inject({ method: "POST", url: `/invites/${invite.code}/accept`, headers: omar });
    const id = async (h: H) => (await app.inject({ method: "GET", url: "/me", headers: h })).json().user.id as string;

    const { entry, share_text } = await create(mona, { other_name: "عمر", direction: "owed_to_me", amount: 120, circle_id: circle.id, other_user_id: await id(omar) });
    expect(share_text).toBeNull();
    expect(entry.circle_id).toBe(circle.id);
    expect((await list(omar))[0]).toMatchObject({ other_name: "منى", direction: "i_owe", status: "pending", mine: false });
    expect((await chat(omar)).find((m) => m.kind === "update")!.text).toContain("في الدفتر من منى: 120 جنيه");

    // Not in the circle: refused, for the sender or the other person.
    const bad = { other_name: "x", direction: "owed_to_me", amount: 5, circle_id: circle.id };
    expect((await app.inject({ method: "POST", url: "/daftar", headers: outsider, payload: bad })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/daftar", headers: mona, payload: { ...bad, other_user_id: await id(outsider) } })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/daftar", headers: mona, payload: { ...bad, amount: -5 } })).statusCode).toBe(400);
  });

  it("accepts only real InstaPay links in settings", async () => {
    const h = await signedIn("A");
    expect((await app.inject({ method: "PATCH", url: "/me", headers: h, payload: { instapay_link: "https://evil.example/pay" } })).json()).toEqual({ error: "invalid_instapay_link" });
    expect((await app.inject({ method: "PATCH", url: "/me", headers: h, payload: { instapay_link: PAY } })).json().user.instapay_link).toBe(PAY);
    expect((await app.inject({ method: "PATCH", url: "/me", headers: h, payload: { instapay_link: null } })).json().user.instapay_link).toBeNull();
  });
});
