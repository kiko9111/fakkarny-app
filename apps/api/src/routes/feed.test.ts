import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { CircleFeedResponse, CircleResponse, CreateInviteResponse, ListMessagesResponse, MeResponse, PostResponse, TaskResponse } from "@fakkarni/shared";
import { buildApp } from "../app";
import type { PushMessage } from "../proactive/push";
import { hasTestDb, resetDb, testPrisma } from "../../test/db";

const SECRET = "test-secret-at-least-32-characters-long!!";
const token = (sub: string) =>
  new SignJWT({ role: "authenticated" }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setAudience("authenticated").setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

describe.skipIf(!hasTestDb)("circle feed: reactions, comments, @Zaki", () => {
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
      push: async (m) => {
        pushed.push(...m);
        return { invalidTokens: [], sent: m.length };
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

  type H = Record<string, string>;
  const signedIn = async (name: string, extra: object = {}): Promise<H & { id: string }> => {
    const h = { authorization: `Bearer ${await token(randomUUID())}` };
    const res = await app.inject({ method: "PATCH", url: "/me", headers: h, payload: { name, ...extra } });
    return Object.defineProperty({ ...h }, "id", { value: MeResponse.parse(res.json()).user.id, enumerable: false }) as unknown as H & { id: string };
  };
  const post = (h: H, url: string, payload?: object) => app.inject({ method: "POST", url, headers: h, ...(payload ? { payload } : {}) });
  const feed = async (h: H, circleId: string) => CircleFeedResponse.parse((await app.inject({ method: "GET", url: `/circles/${circleId}/feed`, headers: h })).json());
  const chat = async (h: H) => ListMessagesResponse.parse((await app.inject({ method: "GET", url: "/messages", headers: { ...h, "x-message-kinds": "2" } })).json()).messages;
  const home = async () => {
    const mama = await signedIn("ماما");
    const omar = await signedIn("عمر");
    const sara = await signedIn("Sara", { language: "en" });
    const circle = CircleResponse.parse((await post(mama, "/circles", { kind: "family", name: "البيت" })).json()).circle;
    const { invite } = CreateInviteResponse.parse((await post(mama, `/circles/${circle.id}/invites`)).json());
    await post(omar, `/invites/${invite.code}/accept`);
    await post(sara, `/invites/${invite.code}/accept`);
    for (const [u, tok] of [[omar, "omar"], [sara, "sara"], [mama, "mama"]] as const) await prisma.device.create({ data: { userId: u.id, platform: "android", pushToken: `ExponentPushToken[${tok}]` } });
    return { mama, omar, sara, circleId: circle.id };
  };

  it("lets members react once each and comment, and tells the person it is about", async () => {
    const { mama, omar, sara, circleId } = await home();
    const task = TaskResponse.parse((await post(mama, `/circles/${circleId}/tasks`, { assignee_id: omar.id, title: "واجب الحساب", homework: true })).json()).task;
    await post(omar, `/tasks/${task.id}/respond`, { answer: "accept" });
    await post(omar, `/tasks/${task.id}/done`);
    const done = (await feed(mama, circleId)).posts[0]!;
    expect(done.text).toContain("واجب الحساب");

    await post(mama, `/circles/${circleId}/posts/${done.id}/react`, { key: "heart" });
    await post(sara, `/circles/${circleId}/posts/${done.id}/react`, { key: "clap" });
    let p = PostResponse.parse((await post(sara, `/circles/${circleId}/posts/${done.id}/react`, { key: "heart" })).json()).post;
    expect(p.reactions).toEqual([{ key: "heart", count: 2 }]);
    expect(p.my_reaction).toBe("heart");
    p = PostResponse.parse((await post(sara, `/circles/${circleId}/posts/${done.id}/react`, { key: null })).json()).post;
    expect(p.reactions).toEqual([{ key: "heart", count: 1 }]);

    pushed.length = 0;
    p = PostResponse.parse((await post(mama, `/circles/${circleId}/posts/${done.id}/comments`, { text: "برافو يا عمر 💛" })).json()).post;
    expect(p.comments).toEqual([expect.objectContaining({ author_name: "ماما", is_mine: true, is_zaki: false, text: "برافو يا عمر 💛" })]);
    expect(p.comment_count).toBe(1);
    await new Promise((r) => setTimeout(r, 50));
    expect(pushed.map((m) => [m.to, m.body])).toEqual([["ExponentPushToken[omar]", "ماما: برافو يا عمر 💛"]]);

    // Others see it; only the writer removes it.
    const seen = (await feed(sara, circleId)).posts[0]!.comments[0]!;
    expect(seen.is_mine).toBe(false);
    expect((await app.inject({ method: "DELETE", url: `/circles/${circleId}/comments/${seen.id}`, headers: sara })).statusCode).toBe(404);
    expect((await app.inject({ method: "DELETE", url: `/circles/${circleId}/comments/${seen.id}`, headers: mama })).statusCode).toBe(204);
  });

  it("answers @Zaki by rules: reminds everyone in their own chat, once in a while", async () => {
    const { mama, omar, sara, circleId } = await home();
    const ask = PostResponse.parse((await post(mama, `/circles/${circleId}/zaki`, { text: "زكي فكّر الكل بغدا الجمعة" })).json()).post;
    expect(ask.text).toBe("ماما لزكي: «فكّر الكل بغدا الجمعة»");
    expect(ask.comments.at(-1)).toMatchObject({ is_zaki: true, text: "تمام، فكّرت 2 في الدايرة في الشات بتاعهم 💛" });
    expect((await chat(omar)).at(-1)!.text).toBe("تذكير من ماما في «البيت»: غدا الجمعة 💛");
    expect((await chat(sara)).at(-1)!.text).toBe("A reminder from ماما in “البيت”: غدا الجمعة 💛");
    // Sara reads Zaki's answer in English.
    expect((await feed(sara, circleId)).posts[0]!.comments.at(-1)!.text).toBe("Done, I reminded 2 people in their chats 💛");

    const again = PostResponse.parse((await post(mama, `/circles/${circleId}/zaki`, { text: "زكي فكّر الكل بالغدا" })).json()).post;
    expect(again.comments.at(-1)!.text).toContain("لسه مفكّرهم من شوية");

    // In a comment too, and for the week's summary; anything else gets what Zaki can do.
    clock = new Date("2026-11-22T10:05:00Z");
    const summary = PostResponse.parse((await post(omar, `/circles/${circleId}/posts/${ask.id}/comments`, { text: "@زكي ملخص الأسبوع" })).json()).post;
    expect(summary.comments.at(-1)).toMatchObject({ is_zaki: true });
    expect(summary.comments.at(-1)!.text).toContain("الأسبوع ده");
    const help = PostResponse.parse((await post(sara, `/circles/${circleId}/zaki`, { text: "Zaki tell me a joke" })).json()).post;
    expect(help.comments.at(-1)!.text).toContain("Here I can remind everyone");
  });
});
