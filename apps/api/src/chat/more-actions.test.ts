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

describe.skipIf(!hasTestDb)("the whole app from chat: undo, answers on news, shortcuts", () => {
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

  const chatOf = async (h: H) => ListMessagesResponse.parse((await app.inject({ method: "GET", url: "/messages", headers: h })).json()).messages;
  const taskRequest = async (kareem: H, homework = false) => {
    queue.push(ok({ reply: ["أبعتها لمنى؟"], app_actions: [{ kind: "assign_task", person: "منى", title: homework ? "الحساب صفحة ١٢" : "تجيب عيش", ...(homework ? { homework: true } : {}) }] }));
    const r = await say(kareem, "قول لمنى");
    await post(kareem, `/messages/${r.replies.at(-1)!.id}/actions/${cardsOf(r)[0]!.id}`, { confirm: true });
    return prisma.circleTask.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
  };

  it("takes back the user's own change with Undo, by tap or by saying it", async () => {
    const kareem = await signedIn("كريم");
    queue.push(ok({ reply: ["عملتها"], app_actions: [{ kind: "create_section", name: "أكل", money_kind: "expense", amount: 3000 }, { kind: "log_money", amount: 250, money_kind: "expense", section: "أكل" }] }));
    const r = await say(kareem, "اعمل قسم أكل وسجل ٢٥٠");
    const [section, logged] = cardsOf(r);
    expect(section).toMatchObject({ status: "done", undoable: true });
    expect(logged).toMatchObject({ status: "done", undoable: true });
    // Tap Undo on the money log: the entry goes, the card says so.
    const tapped = await post(kareem, `/messages/${r.replies.at(-1)!.id}/actions/${logged!.id}`, { undo: true });
    expect(tapped.statusCode).toBe(200);
    expect(Message.parse(tapped.json().message).actions[1]).toMatchObject({ status: "cancelled" });
    expect(await prisma.moneyEntry.count()).toBe(0);
    // "تراجع" in the chat takes back the newest one left (the section), with no model call.
    const undone = await say(kareem, "تراجع");
    expect(cardsOf(undone)[0]).toMatchObject({ id: section!.id, status: "cancelled" });
    expect(await prisma.moneySection.count()).toBe(0);
    // Nothing left: the next "undo" goes to the model.
    queue.push(ok({ reply: ["مفيش حاجة أرجعها"] }));
    expect((await say(kareem, "undo")).replies.at(-1)!.text).toBe("مفيش حاجة أرجعها");
  });

  it("puts Yes / No under a request, and no means decline", async () => {
    const { kareem, mona } = await home();
    const task = await taskRequest(kareem);
    const news = (await chatOf(mona)).find((m) => m.kind === "update" && m.actions.length)!;
    expect(news.actions[0]).toMatchObject({ kind: "task_answer", status: "pending" });
    const no = await say(mona, "لأ");
    expect(cardsOf(no)[0]).toMatchObject({ status: "done", kind: "task_answer" });
    expect((await prisma.circleTask.findUniqueOrThrow({ where: { id: task.id } })).status).toBe("declined");
    expect(await prisma.message.count({ where: { userId: kareem.id, kind: "update", clientId: `task:${task.id}:declined` } })).toBe(1);
  });

  it("tells the parent about handed-in homework, with Well done right there", async () => {
    const { kareem, mona } = await home();
    const task = await taskRequest(kareem, true);
    expect((await post(mona, `/tasks/${task.id}/submit`, { text: "خلصت ١ لـ ١٠" })).statusCode).toBe(200);
    // Every message here carries the same test clock, so pick the line by what it is.
    const news = (await chatOf(kareem)).find((m) => m.kind === "update" && m.text.includes("خلصت ١ لـ ١٠"))!;
    const card = news.actions[0]!;
    expect(card).toMatchObject({ kind: "homework_review", status: "pending" });
    await post(kareem, `/messages/${news.id}/actions/${card.id}`, { confirm: true });
    expect((await prisma.circleTask.findUniqueOrThrow({ where: { id: task.id } })).review).toBe("approved");
  });

  it("sends a Daftar entry to a circle member after a yes, and they confirm it from their chat", async () => {
    const { kareem, mona } = await home();
    queue.push(ok({ reply: ["أبعتها لمنى تأكد؟"], app_actions: [{ kind: "daftar_add", person: "منى", amount: 300, direction: "owed_to_me" }] }));
    const r = await say(kareem, "حط في الدفتر منى عليها ٣٠٠");
    expect(cardsOf(r)[0]).toMatchObject({ kind: "daftar_add", status: "pending" });
    expect(await prisma.daftarEntry.count()).toBe(0);
    await say(kareem, "اه ابعتها");
    const news = (await chatOf(mona)).find((m) => m.kind === "update" && m.actions.length)!;
    expect(news.text).toContain("عليك لـ كريم");
    expect(news.actions[0]).toMatchObject({ kind: "daftar_answer", status: "pending" });
    await say(mona, "ايوه");
    expect((await prisma.daftarEntry.findFirstOrThrow()).status).toBe("confirmed");
  });

  it("offers the shared Daftar for a debt with someone in their circles", async () => {
    const { kareem } = await home();
    queue.push(ok({ reply: ["تمام، ٢٠٠ على منى"], create_items: [{ type: "debt", title: "منى ٢٠٠", debt: { person: "منى", amount: 200, direction: "owed_to_me" } }] }));
    const r = await say(kareem, "منى عليها ٢٠٠");
    expect(cardsOf(r)[0]).toMatchObject({ kind: "daftar_add", status: "pending" });
    queue.push(ok({ reply: ["تمام"], create_items: [{ type: "debt", title: "سامح ٥٠", debt: { person: "سامح", amount: 50, direction: "owed_to_me" } }] }));
    expect(cardsOf(await say(kareem, "سامح عليه ٥٠"))).toEqual([]);
  });

  it("offers to tell the family on 'وصلت البيت', with no model call", async () => {
    const { mona, circleId } = await home();
    const r = await say(mona, "وصلت البيت");
    expect(r.replies.at(-1)!.text).toBe("حمد الله على السلامة 🌟");
    expect(cardsOf(r)[0]).toMatchObject({ kind: "checkin", status: "pending" });
    await say(mona, "اه");
    expect(await prisma.circlePost.count({ where: { circleId, event: "checkin:home" } })).toBe(1);
  });

  it("changes settings, splits a bill and marks a share paid from chat", async () => {
    const kareem = await signedIn("كريم");
    queue.push(ok({ reply: ["حاضر"], app_actions: [{ kind: "settings", setting: "address", text: "female" }, { kind: "split_bill", amount: 900, people: ["سارة", "منى"], name: "عشا" }] }));
    const r = await say(kareem, "كلمني بالمؤنث وقسم ٩٠٠ عشا");
    expect(cardsOf(r).map((c) => c.status)).toEqual(["done", "done"]);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: kareem.id } })).gender).toBe("female");
    expect(MeResponse.parse((await app.inject({ method: "GET", url: "/me", headers: kareem })).json()).user.gender).toBe("female");
    queue.push(ok({ reply: ["تمام"], app_actions: [{ kind: "split_paid", person: "سارة" }] }));
    await say(kareem, "سارة دفعت");
    const people = (await prisma.split.findFirstOrThrow()).peopleJson as { name: string; paid: boolean }[];
    expect(people.find((p) => p.name === "سارة")!.paid).toBe(true);
  });

  it("splits a bill with a circle after a yes, and the member pays from their card", async () => {
    const { kareem, mona } = await home();
    queue.push(ok({ reply: ["حاضر"], app_actions: [{ kind: "split_bill", amount: 600, circle: "البيت", name: "غدا" }] }));
    const r = await say(kareem, "قسم ٦٠٠ غدا على البيت");
    const ask = cardsOf(r)[0]!;
    expect(ask).toMatchObject({ kind: "split_bill", status: "pending" });
    // Nothing reaches Mona before the yes.
    expect((await chatOf(mona)).some((m) => m.text.includes("🧾"))).toBe(false);
    const yes = await post(kareem, `/messages/${r.replies.at(-1)!.id}/actions/${ask.id}`, { confirm: true });
    expect(yes.statusCode).toBe(200);
    const split = await prisma.split.findFirstOrThrow();
    expect(split.memberIds).toEqual([mona.id]);
    const line = (await chatOf(mona)).find((m) => m.text.includes("🧾"))!;
    expect(line.text).toContain("نصيبك 300");
    const paid = await post(mona, `/messages/${line.id}/actions/${line.actions![0]!.id}`, { confirm: true });
    expect(paid.statusCode).toBe(200);
    expect(((await prisma.split.findFirstOrThrow()).peopleJson as { paid: boolean }[])[1]!.paid).toBe(true);
    expect((await chatOf(kareem)).some((m) => m.text.includes("نصيب منى اتعلّم إنه اتدفع"))).toBe(true);
  });
});
