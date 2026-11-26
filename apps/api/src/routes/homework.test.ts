import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { CircleResponse, CreateInviteResponse, HomeworkBatchResponse, HomeworkCheckResponse, HomeworkHelpResponse, ListMessagesResponse, MeResponse, PocketMoneyResponse, TaskResponse } from "@fakkarni/shared";
import { buildApp } from "../app";
import { toHomeworkCheck, toHomeworkHelp, type FriendModel, type HomeworkInput } from "../ai/model";
import { remindBefore } from "../homework/store";
import type { PushMessage } from "../proactive/push";
import { hasTestDb, resetDb, testPrisma } from "../../test/db";

const SECRET = "test-secret-at-least-32-characters-long!!";
const token = (sub: string) =>
  new SignJWT({ role: "authenticated" }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setAudience("authenticated").setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));
const usage = { input_tokens: 900, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

describe("homework model output", () => {
  it("tidies help and checks, and refuses what couldn't be read", () => {
    const help = toHomeworkHelp({ readable: true, explain: " الكسر جزء من حاجة ", teach: "قسّم رغيف", practice: ["١/٢ + ١/٤ = ؟", " ", "a", "b", "c", "d"], answers: ["٣/٤", "x", "y", "z", "w", "v"] });
    expect(help).toEqual({ explain: "الكسر جزء من حاجة", teach: "قسّم رغيف", practice: ["١/٢ + ١/٤ = ؟", "a", "b", "c", "d"], answers: ["٣/٤", "x", "y", "z", "w"] });
    expect(toHomeworkHelp({ readable: false, explain: "x", teach: "", practice: [], answers: [] })).toBeNull();
    expect(toHomeworkCheck({ readable: true, praise: "شغل حلو", hints: ["سؤال ٢: راجع الطرح"] })).toEqual({ praise: "شغل حلو", hints: ["سؤال ٢: راجع الطرح"] });
    expect(toHomeworkCheck({ readable: true, praise: " ", hints: [] })).toBeNull();
  });

  it("reminds the evening before homework is due, or soon when that has passed", () => {
    const due = new Date("2026-11-27T06:00:00Z"); // 08:00 Cairo
    expect(remindBefore(due, new Date("2026-11-26T10:00:00Z"))?.toISOString()).toBe("2026-11-26T15:00:00.000Z");
    expect(remindBefore(due, new Date("2026-11-26T20:00:00Z"))?.toISOString()).toBe("2026-11-26T21:00:00.000Z");
    expect(remindBefore(due, new Date("2026-11-27T05:30:00Z"))).toBeNull();
    expect(remindBefore(null, new Date())).toBeNull();
  });
});

describe.skipIf(!hasTestDb)("homework: pocket money, a week at once, Zaki helps", () => {
  const prisma = testPrisma();
  let clock = new Date("2026-11-26T10:00:00Z");
  const pushed: PushMessage[] = [];
  const seen: { kind: string; input: HomeworkInput }[] = [];
  const model: FriendModel = {
    respond: async () => ({ ok: false, reason: "invalid_output", usage }),
    complete: async () => ({ text: "", usage }),
    homeworkHelp: async (input) => (seen.push({ kind: "help", input }), { help: { explain: "الكسور يعني أجزاء", teach: "قسّمي البيتزا", practice: ["١/٢ + ١/٢ = ؟"], answers: ["١"] }, usage }),
    homeworkCheck: async (input) => (seen.push({ kind: "check", input }), { check: { praise: "كتابتك واضحة", hints: ["في سؤال ٢ راجع خطوة الطرح"] }, usage }),
  };
  const app = buildApp(
    { logger: false },
    {
      prisma,
      model,
      now: () => clock,
      rateLimitPerMinute: false,
      auth: { supabaseJwtSecret: SECRET, allowInstallId: true },
      invites: { publicUrl: "https://zaki.test" },
      billing: { requireSubscription: true },
      push: async (messages) => {
        pushed.push(...messages);
        return { invalidTokens: [], sent: messages.length };
      },
    },
  );
  beforeEach(async () => {
    await resetDb(prisma);
    clock = new Date("2026-11-26T10:00:00Z");
    pushed.length = 0;
    seen.length = 0;
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  type H = Record<string, string> & { id: string };
  const signedIn = async (name: string, extra: object = {}): Promise<H> => {
    const h = { authorization: `Bearer ${await token(randomUUID())}` };
    const res = await app.inject({ method: "PATCH", url: "/me", headers: h, payload: { name, ...extra } });
    expect(res.statusCode).toBe(200);
    return Object.defineProperty({ ...h }, "id", { value: MeResponse.parse(res.json()).user.id, enumerable: false }) as unknown as H;
  };
  const circleOf = async (owner: H, ...others: H[]) => {
    const circle = CircleResponse.parse((await app.inject({ method: "POST", url: "/circles", headers: owner, payload: { kind: "family", name: "البيت" } })).json()).circle;
    const { invite } = CreateInviteResponse.parse((await app.inject({ method: "POST", url: `/circles/${circle.id}/invites`, headers: owner })).json());
    for (const h of others) expect((await app.inject({ method: "POST", url: `/invites/${invite.code}/accept`, headers: h })).statusCode).toBe(200);
    return circle.id;
  };
  const post = (h: H, url: string, payload?: object) => app.inject({ method: "POST", url, headers: h, ...(payload ? { payload } : {}) });
  const chat = async (h: H) => ListMessagesResponse.parse((await app.inject({ method: "GET", url: "/messages", headers: { ...h, "x-message-kinds": "2" } })).json()).messages;
  const pocket = async (h: H) => PocketMoneyResponse.parse((await app.inject({ method: "GET", url: "/pocket-money", headers: h })).json()).accounts;
  const flush = () => new Promise((r) => setTimeout(r, 50));

  it("adds the reward to the child's record on Well done, once, and lets the parent mark it paid", async () => {
    const mama = await signedIn("ماما");
    const omar = await signedIn("عمر");
    const circleId = await circleOf(mama, omar);
    await prisma.device.create({ data: { userId: omar.id, platform: "android", pushToken: "ExponentPushToken[omar]" } });
    const res = await post(mama, `/circles/${circleId}/tasks`, { assignee_id: omar.id, title: "واجب الحساب", homework: true, subject: "رياضيات", reward: 20 });
    expect(res.statusCode).toBe(201);
    const task = TaskResponse.parse(res.json()).task;
    expect(task).toMatchObject({ reward: 20, subject: "رياضيات" });
    expect((await chat(omar)).at(-1)!.text).toContain("المكافأة: 20 جنيه مصروف");

    // A reward on a plain task is dropped (rewards are for homework).
    const plain = TaskResponse.parse((await post(mama, `/circles/${circleId}/tasks`, { assignee_id: omar.id, title: "رتّب أوضتك", reward: 10 })).json()).task;
    expect(plain.reward).toBeNull();

    expect((await post(omar, `/tasks/${task.id}/submit`, { text: "خلصت" })).statusCode).toBe(200);
    // A redo earns nothing.
    await post(mama, `/tasks/${task.id}/review`, { verdict: "redo" });
    expect(await pocket(omar)).toEqual([]);
    await post(omar, `/tasks/${task.id}/submit`, { text: "صلّحته" });
    expect((await post(mama, `/tasks/${task.id}/review`, { verdict: "approved" })).statusCode).toBe(200);
    const line = (await chat(omar)).at(-1)!.text;
    expect(line).toContain("+20 جنيه مصروف من ماما");
    expect(line).toContain("رصيدك دلوقتي 20 جنيه");
    // Well done again adds nothing.
    await post(mama, `/tasks/${task.id}/review`, { verdict: "approved" });

    const [child] = await pocket(omar);
    expect(child).toMatchObject({ role: "child", parent_name: "ماما", earned: 20, paid: 0, balance: 20, week_earned: 20 });
    expect(child!.entries).toMatchObject([{ kind: "earned", amount: 20, title: "واجب الحساب" }]);

    // The parent marks some as handed over; never more than is owed; the child is told.
    expect((await post(mama, "/pocket-money/paid", { circle_id: circleId, child_id: omar.id, amount: 50 })).statusCode).toBe(422);
    expect((await post(omar, "/pocket-money/paid", { circle_id: circleId, child_id: mama.id, amount: 5 })).statusCode).toBe(422);
    const id = randomUUID();
    const paid = PocketMoneyResponse.parse((await post(mama, "/pocket-money/paid", { id, circle_id: circleId, child_id: omar.id, amount: 15 })).json()).accounts;
    expect(paid[0]).toMatchObject({ role: "parent", child_name: "عمر", earned: 20, paid: 15, balance: 5 });
    // A resend of the same id changes nothing.
    expect((await post(mama, "/pocket-money/paid", { id, circle_id: circleId, child_id: omar.id, amount: 15 })).statusCode).toBe(200);
    expect((await pocket(omar))[0]).toMatchObject({ balance: 5 });
    expect((await chat(omar)).at(-1)!.text).toContain("15 جنيه من مصروفك اتسلّموا من ماما");
    await flush();
    expect(pushed.some((p) => p.body.includes("اتسلّموا"))).toBe(true);
    // In the export of both people.
    const exp = (await app.inject({ method: "GET", url: "/me/export", headers: omar })).json() as { pocket_money: unknown[] };
    expect(exp.pocket_money).toHaveLength(2);
  });

  it("sends a week's homework in one go, with one chat line for the child", async () => {
    const mama = await signedIn("ماما");
    const omar = await signedIn("Omar", { language: "en" });
    const circleId = await circleOf(mama, omar);
    const res = await post(mama, `/circles/${circleId}/homework`, {
      assignee_id: omar.id,
      items: [
        { title: "Math page 12", subject: "Math", due_at: "2026-11-29T06:00:00.000Z", reward: 10 },
        { title: "Read lesson 3", subject: "Science", reward: 5 },
      ],
    });
    expect(res.statusCode).toBe(201);
    const { tasks } = HomeworkBatchResponse.parse(res.json());
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toMatchObject({ homework: true, status: "pending", reward: 10, subject: "Math", remind_at: "2026-11-28T15:00:00.000Z" });
    const lines = (await chat(omar)).filter((m) => m.kind === "update");
    expect(lines).toHaveLength(1);
    expect(lines[0]!.text).toContain("New homework from ماما");
    expect(lines[0]!.text).toContain("• Math page 12");
    expect(lines[0]!.text).toContain("EGP 15");
    // Only circle members, and not to yourself.
    const stranger = await signedIn("غريب");
    expect((await post(stranger, `/circles/${circleId}/homework`, { assignee_id: omar.id, items: [{ title: "x" }] })).statusCode).toBe(404);
    expect((await post(mama, `/circles/${circleId}/homework`, { assignee_id: mama.id, items: [{ title: "x" }] })).statusCode).toBe(400);
  });

  it("explains a lesson to the parent and gives the child hints, counted as AI messages", async () => {
    const mama = await signedIn("ماما");
    const omar = await signedIn("عمر");
    const circleId = await circleOf(mama, omar);
    const task = TaskResponse.parse((await post(mama, `/circles/${circleId}/tasks`, { assignee_id: omar.id, title: "واجب الكسور", homework: true, subject: "رياضيات", note: "صفحة 40" })).json()).task;

    const help = HomeworkHelpResponse.parse((await post(mama, "/homework/help", { task_id: task.id, text: "مش فاهمة جمع الكسور" })).json());
    expect(help).toMatchObject({ error: null, help: { practice: ["١/٢ + ١/٢ = ؟"] }, ai_allowance: { used: 1 } });
    expect(seen[0]!.input.about).toContain("HOMEWORK: واجب الكسور");
    expect(seen[0]!.input.about).toContain("SUBJECT: رياضيات");
    // Help on a homework is for the parent who set it.
    expect((await post(omar, "/homework/help", { task_id: task.id, text: "x" })).statusCode).toBe(404);
    // Free help, with nothing about a task.
    expect((await post(mama, "/homework/help", { text: "اشرحلي الماضي البسيط" })).statusCode).toBe(200);

    const check = HomeworkCheckResponse.parse((await post(omar, `/tasks/${task.id}/check`, { text: "1) 3/4  2) 1/3" })).json());
    expect(check).toMatchObject({ check: { hints: ["في سؤال ٢ راجع خطوة الطرح"] }, error: null });
    // Checks are the child's, on open homework only.
    expect((await post(mama, `/tasks/${task.id}/check`, { text: "x" })).statusCode).toBe(404);
    const ai = await prisma.event.findMany({ where: { name: "ai_call" } });
    expect(ai).toHaveLength(3);
    expect(ai.every((e) => (e.propsJson as { purpose: string }).purpose === "chat")).toBe(true);
    // Nothing the child or parent typed is stored.
    expect(JSON.stringify(await prisma.event.findMany())).not.toContain("الكسور يعني");
    expect(JSON.stringify(await prisma.event.findMany())).not.toContain("3/4");

    // At most 5 checks a day on one homework.
    for (let n = 0; n < 4; n++) expect((await post(omar, `/tasks/${task.id}/check`, { text: "again" })).statusCode).toBe(200);
    expect((await post(omar, `/tasks/${task.id}/check`, { text: "again" })).statusCode).toBe(429);

    await post(omar, `/tasks/${task.id}/submit`, { text: "خلصت" });
    expect((await post(omar, `/tasks/${task.id}/check`, { text: "x" })).statusCode).toBe(409);
  });

  it("answers words of danger with the helpline and no AI call, and stops at the daily allowance", async () => {
    const mama = await signedIn("ماما");
    const omar = await signedIn("عمر");
    const circleId = await circleOf(mama, omar);
    const task = TaskResponse.parse((await post(mama, `/circles/${circleId}/tasks`, { assignee_id: omar.id, title: "واجب", homework: true })).json()).task;
    const crisis = HomeworkCheckResponse.parse((await post(omar, `/tasks/${task.id}/check`, { text: "عايز أموت نفسي" })).json());
    expect(crisis.check).toBeNull();
    expect(crisis.helpline).toContain("16328");
    expect(seen).toHaveLength(0);

    // Someone outside any circle (joining through an invite gives both sides Pro days).
    const sami = await signedIn("سامي");
    await prisma.event.createMany({ data: Array.from({ length: 30 }, () => ({ userId: sami.id, name: "ai_call", propsJson: { purpose: "chat" }, createdAt: clock })) });
    const limited = HomeworkHelpResponse.parse((await post(sami, "/homework/help", { text: "اشرحلي" })).json());
    expect(limited).toMatchObject({ help: null, error: "limit" });
    expect(seen).toHaveLength(0);
  });
});
