import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { CircleResponse, CreateInviteResponse, FORWARD_MARK, markForwarded, MeResponse, PostMessageResponse, type FriendResponse } from "@fakkarni/shared";
import { buildApp } from "../app";
import type { FriendModel, FriendModelInput, FriendModelResult } from "../ai/model";
import { createConversationPipeline } from "../pipeline/conversation";
import { hasTestDb, resetDb, testPrisma } from "../../test/db";
import { forwardNote, homeworkDrafts } from "./read";

describe("homeworkDrafts", () => {
  it("spots the school's list and leaves other messages alone", () => {
    const school = "صباح الخير يا أولياء الأمور\nواجب بكرة:\nعربي: صفحة ١٢ و ١٣\nرياضيات: تمارين ٣ و ٤\nمع تحيات المدرسة";
    const drafts = homeworkDrafts(school, "2026-11-19");
    expect(drafts.map((d) => d.subject)).toEqual(["عربي", "رياضيات"]);
    expect(homeworkDrafts("هات عيش وبيض ولبن وانت جاي", "2026-11-19")).toEqual([]);
    expect(homeworkDrafts("(sent 18/11/2026, 21:00)\nMath: page 4\nScience: read chapter 2", "2026-11-19")).toHaveLength(2);
  });

  it("tells the model whose words they are and about the homework card", () => {
    expect(forwardNote({ homework: null })).toContain("not the user's own words");
    expect(forwardNote({ homework: { drafts: [{ title: "x", subject: "Math", due_day: null }], children: [{ circleId: "c", circleName: "Home", userId: "u", name: "Omar" }] } })).toContain("send these 1 homework items to Omar");
  });
});

const SECRET = "test-secret-at-least-32-characters-long!!";
const token = (sub: string) =>
  new SignJWT({ role: "authenticated" }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setAudience("authenticated").setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));
const usage = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const ok = (output: Partial<FriendResponse> & { reply: string[] }): FriendModelResult => ({
  ok: true,
  usage,
  output: { create_items: [], update_items: [], save_memories: [], app_actions: [], crisis: false, ...output },
});

describe.skipIf(!hasTestDb)("forwarded messages", () => {
  const prisma = testPrisma();
  // Thursday 2026-11-19 12:00 in Cairo.
  const clock = new Date("2026-11-19T10:00:00Z");
  const queue: FriendModelResult[] = [];
  const calls: FriendModelInput[] = [];
  const model: FriendModel = {
    async respond(input) {
      calls.push(input);
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
      pipeline: createConversationPipeline({ model }),
      push: async (m) => ({ invalidTokens: [], sent: m.length }),
    },
  );
  beforeEach(async () => {
    await resetDb(prisma);
    queue.length = 0;
    calls.length = 0;
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  type H = Record<string, string> & { id: string };
  const signedIn = async (name: string, language = "ar-EG"): Promise<H> => {
    const h = { authorization: `Bearer ${await token(randomUUID())}`, "x-message-kinds": "2" };
    const id = MeResponse.parse((await app.inject({ method: "PATCH", url: "/me", headers: h, payload: { name, language } })).json()).user.id;
    return Object.defineProperty({ ...h }, "id", { value: id, enumerable: false }) as unknown as H;
  };
  const say = async (h: H, text: string) => {
    const res = await app.inject({ method: "POST", url: "/messages", headers: h, payload: { client_id: randomUUID(), text, created_at: clock.toISOString(), timezone: "Africa/Cairo" } });
    expect(res.statusCode).toBe(201);
    return PostMessageResponse.parse(res.json());
  };

  it("reads someone else's words: no rule shortcut, no memories, the user's language, one Undo for what it saved", async () => {
    const mom = await signedIn("منى", "en");
    queue.push(
      ok({
        reply: ["The club wants 450 by Sunday, and there's a parents' meeting Thursday at 6. Saved both."],
        create_items: [
          { type: "reminder", title: "Pay the club 450", due_at_local: "2026-11-22T10:00", remind_at_local: "2026-11-21T20:00" },
          { type: "reminder", title: "Parents' meeting", due_at_local: "2026-11-26T18:00", remind_at_local: "2026-11-26T17:00" },
        ],
        save_memories: [{ kind: "fact", subject: "Club", content: "I paid 300 for petrol" }],
      }),
    );
    // "دفعت 300 بنزين" would be logged as spending by the money rules if the user had said it.
    const out = await say(mom, markForwarded("[19/11/2026, 9:00 AM] Coach Ali: دفعت 300 بنزين للباص. اشتراك النادي 450 قبل الأحد، واجتماع أولياء الأمور الخميس الساعة 6"));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.context).toContain("FORWARDED:");
    // The reply language follows the user, not the forwarded Arabic words.
    expect(calls[0]!.requireArabic).toBe(false);
    expect(out.memories).toEqual([]);
    expect(await prisma.moneyEntry.count()).toBe(0);
    expect(out.items.map((i) => i.title).sort()).toEqual(["Parents' meeting", "Pay the club 450"]);
    const reply = out.replies.at(-1)!;
    const card = reply.actions!.find((a) => a.kind === "forward_saved")!;
    expect(card).toMatchObject({ status: "done", undoable: true });
    expect(card.label).toContain("Saved from the message");

    const undo = await app.inject({ method: "POST", url: `/messages/${reply.id}/actions/${card.id}`, headers: mom, payload: { undo: true } });
    expect(undo.statusCode).toBe(200);
    expect(await prisma.item.count({ where: { userId: mom.id, status: "open" } })).toBe(0);
    const event = await prisma.event.findFirst({ where: { userId: mom.id, name: "ai_call" } });
    expect(event?.propsJson).toMatchObject({ forwarded: true });
  });

  it("offers a school homework list to the child, and sends it on Yes", async () => {
    const mom = await signedIn("منى");
    const omar = await signedIn("عمر");
    const circle = CircleResponse.parse((await app.inject({ method: "POST", url: "/circles", headers: mom, payload: { kind: "family", name: "البيت" } })).json()).circle;
    const { invite } = CreateInviteResponse.parse((await app.inject({ method: "POST", url: `/circles/${circle.id}/invites`, headers: mom })).json());
    await app.inject({ method: "POST", url: `/invites/${invite.code}/accept`, headers: omar });
    await prisma.circleMember.updateMany({ where: { userId: omar.id }, data: { familyRole: "teen" } });
    await prisma.circleMember.updateMany({ where: { userId: mom.id }, data: { familyRole: "parent" } });

    queue.push(ok({ reply: ["ده واجب بكرة 📚 لو تحبي أبعته لعمر دوسي تحت."] }));
    const out = await say(mom, `${FORWARD_MARK}واجب بكرة:\nعربي: صفحة ١٢\nرياضيات: تمارين ٣ و ٤\nعلوم: اقرا الدرس التاني`);
    expect(calls[0]!.context).toContain("HOMEWORK LIST");
    const reply = out.replies.at(-1)!;
    const card = reply.actions!.find((a) => a.kind === "homework_batch")!;
    expect(card.status).toBe("pending");
    expect(card.label).toContain("عمر");
    expect(card.label).toContain("3");

    const yes = await app.inject({ method: "POST", url: `/messages/${reply.id}/actions/${card.id}`, headers: mom, payload: { confirm: true } });
    expect(yes.statusCode).toBe(200);
    const tasks = await prisma.circleTask.findMany({ where: { assigneeId: omar.id }, orderBy: { createdAt: "asc" } });
    expect(tasks.map((t) => [t.subject, t.homework])).toEqual([
      ["عربي", true],
      ["رياضيات", true],
      ["علوم", true],
    ]);
    // Due tomorrow (Friday) at 08:00 Cairo.
    expect(tasks[0]!.dueAt?.toISOString()).toBe("2026-11-20T06:00:00.000Z");
  });

  it("a plain message is not forwarded", async () => {
    const mom = await signedIn("منى");
    queue.push(ok({ reply: ["تمام"] }));
    await say(mom, "فكرني بالنادي");
    expect(calls[0]!.context).not.toContain("FORWARDED:");
  });
});
