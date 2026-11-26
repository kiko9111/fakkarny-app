import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { CircleResponse, CreateInviteResponse, ListMessagesResponse, ListSplitsResponse, MeResponse, SplitResponse } from "@fakkarni/shared";
import { buildApp } from "../app";
import type { PushMessage } from "../proactive/push";
import { hasTestDb, resetDb, testPrisma } from "../../test/db";

const SECRET = "test-secret-at-least-32-characters-long!!";
const token = (sub: string) =>
  new SignJWT({ role: "authenticated" }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setAudience("authenticated").setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

describe.skipIf(!hasTestDb)("group splits", () => {
  const prisma = testPrisma();
  const pushed: PushMessage[] = [];
  const app = buildApp(
    { logger: false },
    {
      prisma,
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
    pushed.length = 0;
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  type H = Record<string, string> & { id: string };
  const signedIn = async (name: string, extra: object = {}): Promise<H> => {
    const h = { authorization: `Bearer ${await token(randomUUID())}` };
    const res = await app.inject({
      method: "PATCH",
      url: "/me",
      headers: h,
      payload: { name, ...extra },
    });
    expect(res.statusCode).toBe(200);
    return Object.defineProperty({ ...h }, "id", {
      value: MeResponse.parse(res.json()).user.id,
      enumerable: false,
    }) as unknown as H;
  };
  const circleOf = async (owner: H, ...others: H[]) => {
    const circle = CircleResponse.parse(
      (
        await app.inject({
          method: "POST",
          url: "/circles",
          headers: owner,
          payload: { kind: "friends", name: "الشلة" },
        })
      ).json(),
    ).circle;
    const { invite } = CreateInviteResponse.parse(
      (
        await app.inject({
          method: "POST",
          url: `/circles/${circle.id}/invites`,
          headers: owner,
        })
      ).json(),
    );
    for (const h of others)
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/invites/${invite.code}/accept`,
            headers: h,
          })
        ).statusCode,
      ).toBe(200);
    return circle.id;
  };
  const chat = async (h: H) =>
    ListMessagesResponse.parse(
      (
        await app.inject({
          method: "GET",
          url: "/messages",
          headers: { ...h, "x-message-kinds": "2" },
        })
      ).json(),
    ).messages;
  const form = { "content-type": "application/x-www-form-urlencoded" };

  it("tells each member their share, lets them say they paid, and keeps edits to the creator", async () => {
    const kareem = await signedIn("Kareem", {
      language: "en",
      instapay_link: "https://ipn.eg/S/kareem/instapay/abc123",
    });
    const mona = await signedIn("Mona");
    const sara = await signedIn("Sara", { language: "en" });
    const stranger = await signedIn("Omar");
    const circleId = await circleOf(kareem, mona, sara);

    const res = await app.inject({
      method: "POST",
      url: "/splits",
      headers: kareem,
      payload: {
        title: "Friday dinner",
        subtotal: 900,
        service_pct: 0,
        vat_pct: 0,
        paid_by: 0,
        circle_id: circleId,
        // Omar is not in the circle: his id is dropped and he stays a plain name.
        people: [
          { name: "Kareem", user_id: kareem.id },
          { name: "Mona", user_id: mona.id },
          { name: "Sara", user_id: sara.id },
          { name: "Omar", user_id: stranger.id },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    const { split, share_text } = SplitResponse.parse(res.json());
    expect(split.mine).toBe(true);
    expect(split.circle_id).toBe(circleId);
    expect(split.people.map((p) => p.user_id ?? null)).toEqual([kareem.id, mona.id, sara.id, null]);
    expect(split.instapay).toContain("ipn.eg");
    expect(share_text).toContain("InstaPay: https://ipn.eg/");

    // Mona hears it in Arabic with an "I paid" card; Sara in English; both get a push.
    const monaLine = (await chat(mona)).find((m) => m.text.includes("🧾"))!;
    expect(monaLine.text).toContain("«Friday dinner» من Kareem: نصيبك");
    expect(monaLine.actions?.[0]).toMatchObject({
      kind: "split_paid",
      status: "pending",
      route: `/split/${split.id}`,
    });
    expect((await chat(sara)).find((m) => m.text.includes("🧾"))!.text).toContain("Kareem split «Friday dinner» with you: your share is");
    expect(pushed).toHaveLength(0); // no devices registered; the lines are in the chat either way
    expect((await chat(stranger)).filter((m) => m.text.includes("🧾"))).toHaveLength(0);

    // Members see it read-only, with their own row and the payer's InstaPay link.
    const forMona = ListSplitsResponse.parse((await app.inject({ method: "GET", url: "/splits", headers: mona })).json()).splits;
    expect(forMona).toHaveLength(1);
    expect(forMona[0]).toMatchObject({
      mine: false,
      me: 1,
      owner_name: "Kareem",
    });
    expect(forMona[0]!.instapay).toContain("ipn.eg");
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/splits/${split.id}`,
          headers: stranger,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/splits/${split.id}`,
          headers: mona,
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await app.inject({
          method: "PUT",
          url: `/splits/${split.id}`,
          headers: mona,
          payload: { people: [{ name: "a" }, { name: "b" }], subtotal: 1 },
        })
      ).statusCode,
    ).toBe(404);
    expect(await prisma.split.count()).toBe(1);

    // Mona can't tick Sara, only herself.
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/splits/${split.id}/paid`,
          headers: mona,
          payload: { index: 2, paid: true },
        })
      ).statusCode,
    ).toBe(403);

    // Mona answers the card: her share is marked paid and Kareem hears it.
    const answer = await app.inject({
      method: "POST",
      url: `/messages/${monaLine.id}/actions/${monaLine.actions![0]!.id}`,
      headers: { ...mona, "x-message-kinds": "2" },
      payload: { confirm: true },
    });
    expect(answer.statusCode).toBe(200);
    const after = SplitResponse.parse(
      (
        await app.inject({
          method: "GET",
          url: `/splits/${split.id}`,
          headers: kareem,
        })
      ).json(),
    ).split;
    expect(after.people[1]!.paid).toBe(true);
    expect((await chat(kareem)).some((m) => m.text.includes("Mona's share of «Friday dinner» is marked paid"))).toBe(true);

    // Sara says so in the app instead.
    const self = await app.inject({
      method: "POST",
      url: `/splits/${split.id}/paid`,
      headers: sara,
      payload: { index: 2, paid: true },
    });
    expect(SplitResponse.parse(self.json()).split.people[2]!.paid).toBe(true);

    // Omar has no Zaki: he says it on the page, which also offers Kareem's InstaPay link.
    const page = await app.inject({
      method: "GET",
      url: `/s/${split.code}?lang=en`,
    });
    expect(page.body).toContain("Pay Kareem with InstaPay");
    expect(page.body).toContain("I paid my share");
    const web = await app.inject({
      method: "POST",
      url: `/s/${split.code}/paid?lang=en`,
      headers: form,
      payload: "who=3",
    });
    expect(web.body).toContain("Marked as paid");
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/s/${split.code}/paid?lang=en`,
          headers: form,
          payload: "who=3",
        })
      ).body,
    ).toContain("already marked paid");
    // Everyone has paid: no more InstaPay button or "I paid" form.
    const done = await app.inject({
      method: "GET",
      url: `/s/${split.code}?lang=en`,
    });
    expect(done.body).not.toContain("I paid my share");
    expect((await chat(kareem)).some((m) => m.text.includes("Omar's share") && m.text.includes("Untick it"))).toBe(true);

    // Export includes the split for a member, and deleting the account unlinks them.
    expect((await app.inject({ method: "GET", url: "/me/export", headers: mona })).json().splits).toHaveLength(1);
    expect((await app.inject({ method: "DELETE", url: "/me", headers: mona })).statusCode).toBe(204);
    const kept = SplitResponse.parse(
      (
        await app.inject({
          method: "GET",
          url: `/splits/${split.id}`,
          headers: kareem,
        })
      ).json(),
    ).split;
    expect(kept.people[1]).toMatchObject({ name: "Mona", user_id: null });
  });

  it("refuses a circle the creator is not in", async () => {
    const kareem = await signedIn("Kareem");
    const mona = await signedIn("Mona");
    const circleId = await circleOf(mona);
    const res = await app.inject({
      method: "POST",
      url: "/splits",
      headers: kareem,
      payload: {
        subtotal: 100,
        circle_id: circleId,
        people: [{ name: "a" }, { name: "b", user_id: mona.id }],
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it("doesn't offer InstaPay when someone else paid", async () => {
    const kareem = await signedIn("Kareem", {
      instapay_link: "https://ipn.eg/S/kareem/instapay/abc123",
    });
    const res = await app.inject({
      method: "POST",
      url: "/splits",
      headers: kareem,
      payload: {
        subtotal: 300,
        paid_by: 1,
        people: [{ name: "Kareem" }, { name: "Hoda" }],
      },
    });
    const { split, share_text } = SplitResponse.parse(res.json());
    expect(split.instapay).toBeNull();
    expect(share_text).not.toContain("InstaPay");
  });
});
