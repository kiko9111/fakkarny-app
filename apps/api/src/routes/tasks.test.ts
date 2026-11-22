import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { CircleFeedResponse, CircleResponse, CreateInviteResponse, ListItemsResponse, ListMessagesResponse, ListTasksResponse, MeResponse, TaskResponse } from "@fakkarni/shared";
import { buildApp } from "../app";
import type { PushMessage } from "../proactive/push";
import { hasTestDb, resetDb, testPrisma } from "../../test/db";

const SECRET = "test-secret-at-least-32-characters-long!!";
const token = (sub: string) =>
  new SignJWT({ role: "authenticated" }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setAudience("authenticated").setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

describe.skipIf(!hasTestDb)("assigned tasks", () => {
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

  type H = Record<string, string>;
  const signedIn = async (name: string, extra: object = {}): Promise<H & { id: string }> => {
    const h = { authorization: `Bearer ${await token(randomUUID())}` };
    const res = await app.inject({ method: "PATCH", url: "/me", headers: h, payload: { name, ...extra } });
    expect(res.statusCode).toBe(200);
    return Object.defineProperty({ ...h }, "id", { value: MeResponse.parse(res.json()).user.id, enumerable: false }) as unknown as H & { id: string };
  };
  /** A family circle owned by the first person, joined by the others. */
  const circleOf = async (owner: H, ...others: H[]) => {
    const circle = CircleResponse.parse((await app.inject({ method: "POST", url: "/circles", headers: owner, payload: { kind: "family", name: "البيت" } })).json()).circle;
    const { invite } = CreateInviteResponse.parse((await app.inject({ method: "POST", url: `/circles/${circle.id}/invites`, headers: owner })).json());
    for (const h of others) expect((await app.inject({ method: "POST", url: `/invites/${invite.code}/accept`, headers: h })).statusCode).toBe(200);
    return circle.id;
  };
  const post = (h: H, url: string, payload?: object) => app.inject({ method: "POST", url, headers: h, ...(payload ? { payload } : {}) });
  const assign = async (h: H, circleId: string, payload: object) => {
    const res = await post(h, `/circles/${circleId}/tasks`, payload);
    expect(res.statusCode).toBe(201);
    return TaskResponse.parse(res.json()).task;
  };
  const chat = async (h: H) => ListMessagesResponse.parse((await app.inject({ method: "GET", url: "/messages", headers: { ...h, "x-message-kinds": "2" } })).json()).messages;
  const items = async (h: H) => ListItemsResponse.parse((await app.inject({ method: "GET", url: "/items", headers: h })).json()).items;
  const feed = async (h: H, circleId: string) => CircleFeedResponse.parse((await app.inject({ method: "GET", url: `/circles/${circleId}/feed`, headers: h })).json());
  const flush = () => new Promise((r) => setTimeout(r, 50));

  it("asks first: nothing reaches the other person's list or the circle until they accept", async () => {
    const mona = await signedIn("منى");
    const ahmed = await signedIn("Ahmed", { language: "en" });
    const sara = await signedIn("سارة");
    const circleId = await circleOf(mona, ahmed, sara);
    await prisma.device.create({ data: { userId: ahmed.id, platform: "android", pushToken: "ExponentPushToken[ahmed]" } });

    const task = await assign(mona, circleId, { assignee_id: ahmed.id, title: "هات العيش", due_at: "2026-11-22T16:00:00.000Z" });
    expect(task).toMatchObject({ status: "pending", role: "assigner", assignee_name: "Ahmed", circle_name: "البيت", can_nudge: false });

    // Ahmed hears about it from Zaki, in his language, with a push. His list is untouched.
    const asked = (await chat(ahmed)).at(-1)!;
    expect(asked).toMatchObject({ role: "friend", kind: "update" });
    expect(asked.text).toContain("منى is asking you for something in «البيت»: هات العيش");
    await flush();
    expect(pushed).toHaveLength(1);
    expect(pushed[0]).toMatchObject({ to: "ExponentPushToken[ahmed]", title: "Zaki", body: asked.text });
    expect(await items(ahmed)).toHaveLength(0);
    // The third member sees nothing yet; the two people do.
    expect(await feed(sara, circleId)).toEqual({ posts: [], tasks: [] });
    expect((await feed(ahmed, circleId)).tasks).toMatchObject([{ id: task.id, role: "assignee", status: "pending" }]);

    // Only Ahmed can answer.
    expect((await post(mona, `/tasks/${task.id}/respond`, { answer: "accept" })).statusCode).toBe(409);
    expect((await post(sara, `/tasks/${task.id}/respond`, { answer: "accept" })).statusCode).toBe(404);
    const accepted = TaskResponse.parse((await post(ahmed, `/tasks/${task.id}/respond`, { answer: "accept" })).json()).task;
    expect(accepted.status).toBe("accepted");
    expect((await post(ahmed, `/tasks/${task.id}/respond`, { answer: "decline" })).statusCode).toBe(409);

    // Now it is his own reminder, Mona is told, and Zaki posts it in the circle for everyone.
    expect(await items(ahmed)).toMatchObject([{ type: "reminder", title: "هات العيش", status: "open", due_at: "2026-11-22T16:00:00.000Z", remind_at: "2026-11-22T16:00:00.000Z" }]);
    expect((await chat(mona)).at(-1)!.text).toBe("خبر حلو! الرد من Ahmed على «هات العيش»: تمام 🙌");
    const forSara = await feed(sara, circleId);
    expect(forSara.posts.map((p) => p.text)).toEqual(["هات العيش: في إيد Ahmed دلوقتي (طلب منى) 🙌"]);
    expect(forSara.tasks).toMatchObject([{ id: task.id, role: "watcher", status: "accepted" }]);
    expect((await feed(ahmed, circleId)).posts[0]!.text).toBe("Ahmed will take care of: هات العيش (asked by منى) 🙌");
  });

  it("finishes the task when the assignee ticks their own item, and thanks them in the circle", async () => {
    const mona = await signedIn("منى");
    const ahmed = await signedIn("أحمد");
    const circleId = await circleOf(mona, ahmed);
    const task = await assign(mona, circleId, { assignee_id: ahmed.id, title: "كلّم السباك" });
    await post(ahmed, `/tasks/${task.id}/respond`, { answer: "accept" });
    const [item] = await items(ahmed);
    expect(item).toMatchObject({ type: "task", due_at: null });

    clock = new Date("2026-11-22T12:00:00Z");
    expect((await app.inject({ method: "PATCH", url: `/items/${item!.id}`, headers: ahmed, payload: { status: "done" } })).statusCode).toBe(200);
    const mine = ListTasksResponse.parse((await app.inject({ method: "GET", url: "/tasks", headers: mona })).json()).tasks;
    expect(mine).toMatchObject([{ id: task.id, status: "done", done_at: "2026-11-22T12:00:00.000Z" }]);
    expect((await chat(mona)).at(-1)!.text).toContain("تمّت: كلّم السباك ✅ بإيد أحمد");
    expect((await feed(mona, circleId)).posts[0]!.text).toBe("تمّت: كلّم السباك ✅ تسلم الإيد يا أحمد!");
    // Done once: the button on the task does nothing more.
    expect((await post(ahmed, `/tasks/${task.id}/done`)).statusCode).toBe(409);
  });

  it("marks the item done when the task is finished from the task itself", async () => {
    const mona = await signedIn("منى");
    const ahmed = await signedIn("أحمد");
    const circleId = await circleOf(mona, ahmed);
    const task = await assign(mona, circleId, { assignee_id: ahmed.id, title: "كلّم السباك" });
    expect((await post(ahmed, `/tasks/${task.id}/done`)).statusCode).toBe(409);
    await post(ahmed, `/tasks/${task.id}/respond`, { answer: "accept" });
    expect((await post(mona, `/tasks/${task.id}/done`)).statusCode).toBe(409);
    expect(TaskResponse.parse((await post(ahmed, `/tasks/${task.id}/done`)).json()).task.status).toBe("done");
    expect(await items(ahmed)).toMatchObject([{ status: "done" }]);
  });

  it("keeps a decline between the two people and stays kind about it", async () => {
    const mona = await signedIn("منى");
    const ahmed = await signedIn("أحمد");
    const sara = await signedIn("سارة");
    const circleId = await circleOf(mona, ahmed, sara);
    const task = await assign(mona, circleId, { assignee_id: ahmed.id, title: "وصّل الولاد" });
    expect(TaskResponse.parse((await post(ahmed, `/tasks/${task.id}/respond`, { answer: "decline" })).json()).task.status).toBe("declined");
    expect((await chat(mona)).at(-1)!.text).toBe("الرد من أحمد على «وصّل الولاد»: مش هينفع دلوقتي. ولا يهمك، هنلاقي حل تاني 💛");
    expect(await items(ahmed)).toHaveLength(0);
    expect(await feed(sara, circleId)).toEqual({ posts: [], tasks: [] });
    expect((await post(mona, `/tasks/${task.id}/nudge`)).statusCode).toBe(409);
  });

  it("nudges only when the assigner asks, at most every 12 hours and three times", async () => {
    const mona = await signedIn("منى");
    const ahmed = await signedIn("أحمد");
    const circleId = await circleOf(mona, ahmed);
    const task = await assign(mona, circleId, { assignee_id: ahmed.id, title: "هات العيش" });
    expect((await post(mona, `/tasks/${task.id}/nudge`)).statusCode).toBe(409);
    expect((await post(ahmed, `/tasks/${task.id}/nudge`)).statusCode).toBe(409);

    clock = new Date("2026-11-22T22:00:00Z");
    expect(ListTasksResponse.parse((await app.inject({ method: "GET", url: "/tasks", headers: mona })).json()).tasks[0]!.can_nudge).toBe(true);
    expect(TaskResponse.parse((await post(mona, `/tasks/${task.id}/nudge`)).json()).task.can_nudge).toBe(false);
    expect((await chat(ahmed)).at(-1)!.text).toBe("منى في انتظار ردك على: هات العيش. أيوه أو لأ، الاتنين تمام 💛");
    expect((await post(mona, `/tasks/${task.id}/nudge`)).statusCode).toBe(409);

    await post(ahmed, `/tasks/${task.id}/respond`, { answer: "accept" });
    clock = new Date("2026-11-23T10:00:00Z");
    expect((await post(mona, `/tasks/${task.id}/nudge`)).statusCode).toBe(200);
    expect((await chat(ahmed)).at(-1)!.text).toBe("تذكير لطيف من منى: هات العيش. إنت قدّها 💪");
    clock = new Date("2026-11-23T22:00:00Z");
    expect((await post(mona, `/tasks/${task.id}/nudge`)).statusCode).toBe(200);
    clock = new Date("2026-11-25T22:00:00Z");
    expect((await post(mona, `/tasks/${task.id}/nudge`)).statusCode).toBe(409);
  });

  it("lets the assigner cancel, which also clears the other person's list", async () => {
    const mona = await signedIn("منى");
    const ahmed = await signedIn("أحمد");
    const circleId = await circleOf(mona, ahmed);
    const task = await assign(mona, circleId, { assignee_id: ahmed.id, title: "هات العيش" });
    await post(ahmed, `/tasks/${task.id}/respond`, { answer: "accept" });
    expect((await post(ahmed, `/tasks/${task.id}/cancel`)).statusCode).toBe(409);
    expect((await post(mona, `/tasks/${task.id}/cancel`)).statusCode).toBe(200);
    expect(await items(ahmed)).toMatchObject([{ status: "cancelled" }]);
    expect((await chat(ahmed)).at(-1)!.text).toContain("مبقاش فيه داعي لـ: هات العيش (من منى)");
    expect(ListTasksResponse.parse((await app.inject({ method: "GET", url: "/tasks", headers: ahmed })).json()).tasks).toEqual([]);
  });

  it("posts an iftar invitation the circle can answer, once per person", async () => {
    const mona = await signedIn("منى");
    const ahmed = await signedIn("Ahmed", { language: "en" });
    const circleId = await circleOf(mona, ahmed);
    await prisma.device.create({ data: { userId: mona.id, platform: "android", pushToken: "ExponentPushToken[mona]" } });
    await prisma.device.create({ data: { userId: ahmed.id, platform: "android", pushToken: "ExponentPushToken[ahmed]" } });

    const made = await post(mona, `/circles/${circleId}/iftar`, { on: "2027-02-12", note: "عندنا في البيت" });
    expect(made.statusCode).toBe(201);
    const inviteId = (made.json() as { id: string }).id;
    await flush();
    expect(pushed.map((p) => p.to)).toEqual(["ExponentPushToken[ahmed]"]);
    expect(pushed[0]!.body).toBe("البيت: Iftar invitation from منى: Friday 12 February 🌙 (عندنا في البيت) Who's coming?");

    const forAhmed = (await feed(ahmed, circleId)).posts;
    expect(forAhmed).toMatchObject([{ id: inviteId, kind: "iftar", my_rsvp: null }]);
    expect((await feed(mona, circleId)).posts[0]!.text).toContain("عزومة فطار من منى:");

    clock = new Date("2026-11-22T10:05:00Z");
    expect((await post(ahmed, `/circles/${circleId}/posts/${inviteId}/rsvp`, { going: true })).statusCode).toBe(204);
    await flush();
    expect(pushed.at(-1)).toMatchObject({ to: "ExponentPushToken[mona]", body: "Ahmed: جاي إن شاء الله ✋" });
    // Changing the answer replaces it instead of adding a second line.
    expect((await post(ahmed, `/circles/${circleId}/posts/${inviteId}/rsvp`, { going: false })).statusCode).toBe(204);
    const after = (await feed(ahmed, circleId)).posts;
    expect(after.map((p) => p.text)).toEqual(["Ahmed: I can't make it this time 💛", expect.stringContaining("Iftar invitation from منى")]);
    expect(after[1]).toMatchObject({ kind: "iftar", my_rsvp: false });

    const stranger = await signedIn("غريب");
    expect((await post(stranger, `/circles/${circleId}/posts/${inviteId}/rsvp`, { going: true })).statusCode).toBe(404);
    expect((await post(mona, `/circles/${circleId}/iftar`, { on: "next friday" })).statusCode).toBe(400);
  });

  it("refuses people outside the circle, yourself, and empty titles", async () => {
    const mona = await signedIn("منى");
    const ahmed = await signedIn("أحمد");
    const stranger = await signedIn("غريب");
    const circleId = await circleOf(mona, ahmed);
    expect((await post(mona, `/circles/${circleId}/tasks`, { assignee_id: stranger.id, title: "x" })).statusCode).toBe(404);
    expect((await post(stranger, `/circles/${circleId}/tasks`, { assignee_id: ahmed.id, title: "x" })).statusCode).toBe(404);
    expect((await post(mona, `/circles/${circleId}/tasks`, { assignee_id: mona.id, title: "x" })).statusCode).toBe(400);
    expect((await post(mona, `/circles/${circleId}/tasks`, { assignee_id: ahmed.id, title: "  " })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: `/circles/${circleId}/feed`, headers: stranger })).statusCode).toBe(404);
  });
});
