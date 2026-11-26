import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { CircleFeedResponse, CircleResponse, CreateInviteResponse, ListMessagesResponse, MeResponse, Message, PostMessageResponse, type FriendResponse } from "@fakkarni/shared";
import { buildApp } from "../app";
import type { FriendModel, FriendModelResult } from "../ai/model";
import { createConversationPipeline } from "../pipeline/conversation";
import type { PushMessage } from "../proactive/push";
import { hasTestDb, resetDb, testPrisma } from "../../test/db";

const SECRET = "test-secret-at-least-32-characters-long!!";
const token = (sub: string) =>
  new SignJWT({ role: "authenticated" }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setAudience("authenticated").setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));
const usage = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const ok = (output: Partial<FriendResponse> & { reply: string[] }): FriendModelResult => ({ ok: true, usage, output: { create_items: [], update_items: [], save_memories: [], app_actions: [], crisis: false, ...output } });

describe.skipIf(!hasTestDb)("chat actions: Zaki acts in the app from the chat", () => {
  const prisma = testPrisma();
  const clock = new Date("2026-11-22T10:00:00Z"); // Sunday 12:00 Cairo
  const pushed: PushMessage[] = [];
  const queue: FriendModelResult[] = [];
  const model: FriendModel = {
    async respond() {
      const next = queue.shift();
      if (!next) throw new Error("no scripted response");
      return next;
    },
    async complete() {
      return { text: "", usage };
    },
  };
  const app = buildApp(
    { logger: false },
    {
      prisma,
      now: () => clock,
      rateLimitPerMinute: false,
      auth: { supabaseJwtSecret: SECRET, allowInstallId: true },
      invites: { publicUrl: "https://zaki.test" },
      pipeline: createConversationPipeline({ model }),
      push: async (m) => {
        pushed.push(...m);
        return { invalidTokens: [], sent: m.length };
      },
    },
  );
  beforeEach(async () => {
    await resetDb(prisma);
    pushed.length = 0;
    queue.length = 0;
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  type H = Record<string, string>;
  const signedIn = async (name: string, extra: object = {}): Promise<H & { id: string }> => {
    const h = { authorization: `Bearer ${await token(randomUUID())}`, "x-message-kinds": "2" };
    const res = await app.inject({ method: "PATCH", url: "/me", headers: h, payload: { name, ...extra } });
    return Object.defineProperty({ ...h }, "id", { value: MeResponse.parse(res.json()).user.id, enumerable: false }) as unknown as H & { id: string };
  };
  const post = (h: H, url: string, payload?: object) => app.inject({ method: "POST", url, headers: h, ...(payload ? { payload } : {}) });
  const say = async (h: H, text: string) => {
    const res = await post(h, "/messages", { client_id: randomUUID(), text, created_at: clock.toISOString(), timezone: "Africa/Cairo" });
    expect(res.statusCode).toBe(201);
    return PostMessageResponse.parse(res.json());
  };
  const cardsOf = (r: PostMessageResponse) => r.replies.at(-1)!.actions;
  const home = async () => {
    const kareem = await signedIn("كريم");
    const mona = await signedIn("منى");
    const circle = CircleResponse.parse((await post(kareem, "/circles", { kind: "family", name: "البيت" })).json()).circle;
    const { invite } = CreateInviteResponse.parse((await post(kareem, `/circles/${circle.id}/invites`)).json());
    await post(mona, `/invites/${invite.code}/accept`);
    await prisma.device.create({ data: { userId: mona.id, platform: "android", pushToken: "ExponentPushToken[mona]" } });
    return { kareem, mona, circleId: circle.id };
  };

  it("makes a section with a budget and logs money into it in one turn", async () => {
    const kareem = await signedIn("كريم");
    queue.push(ok({ reply: ["تمام، عملتلك قسم العربية وسجلت ٣٠٠ بنزين."], app_actions: [
      { kind: "create_section", name: "العربية", money_kind: "expense", amount: 2000 },
      { kind: "log_money", section: "عربية", amount: 300, money_kind: "expense", note: "بنزين" },
    ] }));
    const r = await say(kareem, "اعملي قسم للعربية ميزانيته ٢٠٠٠ وسجل ٣٠٠ بنزين عليه");
    const cards = cardsOf(r);
    expect(cards.map((c) => c.status)).toEqual(["done", "done"]);
    expect(cards[0]!.label).toContain("العربية");
    expect(cards[1]!.label).toContain("300");
    const section = await prisma.moneySection.findFirstOrThrow({ where: { ownerId: kareem.id } });
    expect(Number(section.budget)).toBe(2000);
    expect(cards[1]!.route).toBe(`/money/${section.id}`);
    expect((await prisma.moneyEntry.findMany({ where: { sectionId: section.id } })).map((e) => Number(e.amount))).toEqual([300]);
    // The cards come back with the chat too, without the server-only payload.
    const listed = ListMessagesResponse.parse((await app.inject({ method: "GET", url: "/messages", headers: kareem })).json()).messages;
    expect(listed.at(-1)!.actions).toHaveLength(2);
    expect(JSON.stringify(listed.at(-1))).not.toContain("payload");
  });

  it("builds a custom tracker with ask times, then logs it by name", async () => {
    const kareem = await signedIn("كريم");
    queue.push(ok({ reply: ["حلو، هنتابع القراية."], app_actions: [{ kind: "create_tracker", name: "القراية", tracker_kind: "custom", amount: 20, unit: "صفحة", ask_times: ["21:00"] }] }));
    expect(cardsOf(await say(kareem, "عايز أتابع القراية ٢٠ صفحة كل يوم واسألني الساعة ٩ بالليل"))[0]).toMatchObject({ status: "done", route: "/trackers" });
    const t = await prisma.tracker.findFirstOrThrow({ where: { userId: kareem.id } });
    expect(t).toMatchObject({ kind: "custom", name: "القراية", askTimes: ["21:00"], unitLabel: "صفحة" });
    queue.push(ok({ reply: ["عاش!"], app_actions: [{ kind: "log_tracker", tracker: "قراية", amount: 12 }] }));
    const logged = cardsOf(await say(kareem, "قريت ١٢ صفحة"))[0]!;
    expect(logged.status).toBe("done");
    expect(logged.label).toContain("12");
  });

  it("asks before assigning a task, and a plain yes sends it", async () => {
    const { kareem, mona, circleId } = await home();
    queue.push(ok({ reply: ["أطلبها من منى؟"], app_actions: [{ kind: "assign_task", person: "منى", title: "تجيب عيش", due_at_local: "2026-11-22T19:00" }] }));
    const asked = cardsOf(await say(kareem, "قول لمنى تجيب عيش النهارده"))[0]!;
    expect(asked).toMatchObject({ status: "pending", route: `/circle/${circleId}` });
    expect(await prisma.circleTask.count()).toBe(0);

    const yes = await say(kareem, "اه ابعتها");
    expect(yes.replies[0]!.text).toContain("✅");
    expect(cardsOf(yes)[0]).toMatchObject({ status: "done", kind: "assign_task" });
    const task = await prisma.circleTask.findFirstOrThrow();
    expect(task).toMatchObject({ assignerId: kareem.id, assigneeId: mona.id, title: "تجيب عيش", status: "pending" });
    expect(task.dueAt?.toISOString()).toBe("2026-11-22T17:00:00.000Z");
    expect(pushed.some((p) => p.to === "ExponentPushToken[mona]")).toBe(true);
    // The original card is answered too, so tapping it later changes nothing.
    const original = await prisma.message.findFirstOrThrow({ where: { userId: kareem.id, role: "friend", text: "أطلبها من منى؟" } });
    expect((original.actionsJson as { status: string }[])[0]!.status).toBe("done");
  });

  it("carries a pocket-money reward on homework asked for in the chat, and shows it on the card", async () => {
    const { kareem, mona } = await home();
    queue.push(ok({ reply: ["أبعته لمنى؟"], app_actions: [{ kind: "assign_task", person: "منى", title: "واجب العربي", homework: true, amount: 20 }] }));
    const asked = cardsOf(await say(kareem, "ابعت لمنى واجب العربي ولو خلصته ليها ٢٠ جنيه"))[0]!;
    expect(asked.label).toContain("20 جنيه");
    await say(kareem, "اه");
    expect(await prisma.circleTask.findFirstOrThrow()).toMatchObject({ assigneeId: mona.id, homework: true, reward: 20 });
  });

  it("posts an ask in the circle only after the card is confirmed, and cancel does nothing", async () => {
    const { kareem, circleId } = await home();
    queue.push(ok({ reply: ["أنزلها في البيت؟"], app_actions: [{ kind: "ask_circle", text: "فكر الكل بغدا الجمعة" }] }));
    const r = await say(kareem, "فكر الكل بغدا الجمعة");
    const reply = r.replies.at(-1)!;
    const card = reply.actions[0]!;
    expect(card.status).toBe("pending");
    const cancelled = await post(kareem, `/messages/${reply.id}/actions/${card.id}`, { confirm: false });
    expect(Message.parse(cancelled.json().message).actions[0]!.status).toBe("cancelled");
    expect(await prisma.circlePost.count({ where: { event: "zaki_ask" } })).toBe(0);
    // Answering again changes nothing.
    const again = await post(kareem, `/messages/${reply.id}/actions/${card.id}`, { confirm: true });
    expect(Message.parse(again.json().message).actions[0]!.status).toBe("cancelled");

    queue.push(ok({ reply: ["أنزلها؟"], app_actions: [{ kind: "ask_circle", circle: "بيت", text: "فكر الكل بغدا الجمعة" }] }));
    const r2 = (await say(kareem, "فكر الكل بغدا الجمعة")).replies.at(-1)!;
    const sent = await post(kareem, `/messages/${r2.id}/actions/${r2.actions[0]!.id}`, { confirm: true });
    expect(Message.parse(sent.json().message).actions[0]!).toMatchObject({ status: "done", route: `/circle/${circleId}` });
    const feed = CircleFeedResponse.parse((await app.inject({ method: "GET", url: `/circles/${circleId}/feed`, headers: kareem })).json());
    expect(feed.posts[0]!.comments[0]!.is_zaki).toBe(true);
  });

  it("says plainly when a person or circle isn't there", async () => {
    await home();
    const kareem2 = await signedIn("حد");
    queue.push(ok({ reply: ["تمام"], app_actions: [{ kind: "assign_task", person: "سامح", title: "يجيب الكيك" }, { kind: "ask_circle", text: "مين جاي؟" }] }));
    const cards = cardsOf(await say(kareem2, "قول لسامح يجيب الكيك"));
    expect(cards.map((c) => c.status)).toEqual(["failed", "failed"]);
    expect(cards[0]!.label).toContain("سامح");
  });

  it("creates a circle and points to it", async () => {
    const kareem = await signedIn("Kareem", { language: "en" });
    queue.push(ok({ reply: ["Done, your gym circle is ready."], app_actions: [{ kind: "create_circle", name: "Gym buddies" }] }));
    const card = cardsOf(await say(kareem, "make a circle for my gym buddies"))[0]!;
    const circle = await prisma.circle.findFirstOrThrow({ where: { createdById: kareem.id } });
    expect(card).toMatchObject({ status: "done", route: `/circle/${circle.id}` });
    expect(circle).toMatchObject({ name: "Gym buddies", kind: "friends" });
  });

  it("asks before logging into a shared book from a plain chat line", async () => {
    const { kareem, mona, circleId } = await home();
    const book = await prisma.moneySection.create({ data: { ownerId: kareem.id, circleId, name: "البيت", kind: "expense", createdAt: clock } });
    const r = await say(kareem, "دفعت 500 في البيت");
    const reply = r.replies.at(-1)!;
    expect(reply.actions[0]!.status).toBe("pending");
    expect(await prisma.moneyEntry.count()).toBe(0);
    await post(kareem, `/messages/${reply.id}/actions/${reply.actions[0]!.id}`, { confirm: true });
    const entry = await prisma.moneyEntry.findFirstOrThrow({ where: { sectionId: book.id } });
    expect(entry.split.sort()).toEqual([kareem.id, mona.id].sort());
  });

  it("never acts on a crisis turn", async () => {
    const kareem = await signedIn("كريم");
    queue.push(ok({ reply: ["أنا معاك."], crisis: true, app_actions: [{ kind: "create_circle", name: "x" }] }));
    const r = await say(kareem, "مش قادر خلاص");
    expect(r.replies.flatMap((m) => m.actions)).toEqual([]);
    expect(await prisma.circle.count()).toBe(0);
  });
});
