import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { CircleFeedResponse, CircleResponse, CreateInviteResponse, ExportResponse, HouseListResponse, LinkTaskResponse, ListLinkResponse, ListMessagesResponse, MeResponse } from "@fakkarni/shared";
import { buildApp } from "../app";
import type { PushMessage } from "../proactive/push";
import { hasTestDb, resetDb, testPrisma } from "../../test/db";

const SECRET = "test-secret-at-least-32-characters-long!!";
const token = (sub: string) =>
  new SignJWT({ role: "authenticated" }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setAudience("authenticated").setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

describe.skipIf(!hasTestDb)("no-app pages: tasks and household lists", () => {
  const prisma = testPrisma();
  let clock = new Date("2026-11-27T10:00:00Z");
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
    clock = new Date("2026-11-27T10:00:00Z");
    pushed.length = 0;
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  type H = Record<string, string> & { id: string };
  const signedIn = async (name: string, language = "ar-EG"): Promise<H> => {
    const h = { authorization: `Bearer ${await token(randomUUID())}`, "x-message-kinds": "2" };
    const res = await app.inject({ method: "PATCH", url: "/me", headers: h, payload: { name, language } });
    const id = MeResponse.parse(res.json()).user.id;
    await prisma.device.create({ data: { userId: id, platform: "android", pushToken: `ExponentPushToken[${id}]` } });
    return Object.defineProperty({ ...h }, "id", { value: id, enumerable: false }) as unknown as H;
  };
  const req = (h: H, method: "GET" | "POST" | "DELETE", url: string, payload?: object) => app.inject({ method, url, headers: h, ...(payload ? { payload } : {}) });
  const form = (url: string, body: Record<string, string> = {}, headers: Record<string, string> = {}) =>
    app.inject({ method: "POST", url, headers: { "content-type": "application/x-www-form-urlencoded", ...headers }, payload: new URLSearchParams(body).toString() });
  const flush = () => new Promise((r) => setTimeout(r, 50));
  const chat = async (h: H) => ListMessagesResponse.parse((await req(h, "GET", "/messages")).json()).messages.map((m) => m.text);
  const pathOf = (url: string) => new URL(url).pathname;

  describe("tasks for someone not on Zaki", () => {
    it("is sent, opened, accepted and done from the browser; the creator hears each step", async () => {
      const mom = await signedIn("منى");
      const res = await req(mom, "POST", "/link-tasks", { other_name: "أحمد", title: "هات العيال من التمرين", due_at: "2026-11-27T16:00:00.000Z", note: "الملعب الجديد https://maps.example/x" });
      expect(res.statusCode).toBe(201);
      const { task, share_text } = LinkTaskResponse.parse(res.json());
      expect(task.status).toBe("pending");
      expect(task.url).toBe(`https://zaki.test/t/${task.code}`);
      expect(share_text).toContain(task.url);
      expect(share_text).toContain("أحمد");
      expect(share_text).toContain("6:00"); // Cairo time, Latin digits

      // A link preview (GET) never answers.
      const page = await app.inject({ method: "GET", url: pathOf(task.url), headers: { "accept-language": "ar" } });
      expect(page.statusCode).toBe(200);
      expect(page.body).toContain("طلب من منى:");
      expect(page.body).toContain("هات العيال من التمرين");
      expect(page.body).toContain('href="https://maps.example/x"');
      expect(page.body).toContain(`action="/t/${task.code}/accept?lang=ar"`);
      expect((await prisma.linkTask.findUniqueOrThrow({ where: { id: task.id } })).status).toBe("pending");

      const yes = await form(`/t/${task.code}/accept?lang=ar`);
      expect(yes.statusCode).toBe(303);
      expect(yes.headers.location).toBe(`/t/${task.code}?lang=ar`);
      await flush();
      expect((await chat(mom)).at(-1)).toBe("👍 أحمد: موافق على «هات العيال من التمرين»");
      expect(pushed).toHaveLength(1);

      // Pressing Accept again (a refresh, a double tap) changes nothing.
      await form(`/t/${task.code}/accept?lang=ar`);
      await flush();
      expect(pushed).toHaveLength(1);

      const accepted = await app.inject({ method: "GET", url: `/t/${task.code}?lang=ar` });
      expect(accepted.body).toContain(">خلصت</button>");
      expect(accepted.body).not.toContain("/accept");

      await form(`/t/${task.code}/done?lang=ar`);
      await flush();
      expect((await chat(mom)).at(-1)).toBe("✅ خلصت: هات العيال من التمرين (من أحمد)");
      const done = await app.inject({ method: "GET", url: `/t/${task.code}?lang=en` });
      expect(done.body).toContain("Thank you! All done");

      const row = await prisma.linkTask.findUniqueOrThrow({ where: { id: task.id } });
      expect(row.status).toBe("done");
      expect(row.webViews).toBeGreaterThan(0);
      const listed = (await req(mom, "GET", "/link-tasks")).json() as { tasks: { status: string; seen: boolean }[] };
      expect(listed.tasks[0]).toMatchObject({ status: "done", seen: true });
    });

    it("can be declined, then taken on after all; cancelled links stop working", async () => {
      const mom = await signedIn("Mona", "en");
      const { task } = LinkTaskResponse.parse((await req(mom, "POST", "/link-tasks", { other_name: "Ahmed", title: "Buy bread" })).json());
      await form(`/t/${task.code}/decline?lang=en`);
      expect((await chat(mom)).at(-1)).toBe("Ahmed can't do it this time: Buy bread 💛 Want to ask someone else?");
      const declined = await app.inject({ method: "GET", url: `/t/${task.code}?lang=en` });
      expect(declined.body).toContain("Actually, I'll do it");
      await form(`/t/${task.code}/accept?lang=en`);
      expect((await chat(mom)).at(-1)).toBe("👍 Ahmed said yes to: Buy bread");

      // Once accepted, "send again" is a gentle reminder.
      const again = LinkTaskResponse.parse((await req(mom, "POST", `/link-tasks/${task.id}/share`)).json());
      expect(again.share_text).toContain("a little reminder");

      expect((await req(mom, "POST", `/link-tasks/${task.id}/cancel`)).statusCode).toBe(204);
      const gone = await app.inject({ method: "GET", url: `/t/${task.code}?lang=en` });
      expect(gone.statusCode).toBe(404);
      expect(gone.body).toContain("This link no longer works");
      const late = await form(`/t/${task.code}/done?lang=en`);
      expect(late.statusCode).toBe(404);
      expect((await prisma.linkTask.findUniqueOrThrow({ where: { id: task.id } })).status).toBe("cancelled");
    });

    it("only the creator sees or changes it; a phone-made id makes a resend harmless", async () => {
      const mom = await signedIn("منى");
      const other = await signedIn("سارة");
      const id = randomUUID();
      const first = await req(mom, "POST", "/link-tasks", { id, other_name: "أحمد", title: "اشتري لبن" });
      const second = await req(mom, "POST", "/link-tasks", { id, other_name: "أحمد", title: "اشتري لبن" });
      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(200);
      expect(LinkTaskResponse.parse(second.json()).task.code).toBe(LinkTaskResponse.parse(first.json()).task.code);
      expect(await prisma.linkTask.count()).toBe(1);
      expect((await req(other, "POST", "/link-tasks", { id, other_name: "x", title: "y" })).statusCode).toBe(422);
      expect((await req(other, "POST", `/link-tasks/${id}/cancel`)).statusCode).toBe(404);
      expect(((await req(other, "GET", "/link-tasks")).json() as { tasks: unknown[] }).tasks).toHaveLength(0);
    });

    it("shows on its circle's feed for the creator only, and is in the export", async () => {
      const mom = await signedIn("منى");
      const dad = await signedIn("كريم");
      const circle = CircleResponse.parse((await req(mom, "POST", "/circles", { kind: "family", name: "البيت" })).json()).circle;
      const { invite } = CreateInviteResponse.parse((await req(mom, "POST", `/circles/${circle.id}/invites`)).json());
      await req(dad, "POST", `/invites/${invite.code}/accept`);
      expect((await req(dad, "POST", "/link-tasks", { circle_id: randomUUID(), other_name: "x", title: "y" })).statusCode).toBe(422);
      await req(mom, "POST", "/link-tasks", { circle_id: circle.id, other_name: "أم محمد", title: "تنضيف المطبخ" });
      const momFeed = CircleFeedResponse.parse((await req(mom, "GET", `/circles/${circle.id}/feed`)).json());
      const dadFeed = CircleFeedResponse.parse((await req(dad, "GET", `/circles/${circle.id}/feed`)).json());
      expect(momFeed.link_tasks.map((t) => t.title)).toEqual(["تنضيف المطبخ"]);
      expect(dadFeed.link_tasks).toEqual([]);
      const exported = ExportResponse.parse((await req(mom, "GET", "/me/export")).json());
      expect(exported.link_tasks.map((t) => t.other_name)).toEqual(["أم محمد"]);
    });

    it("escapes everything a person typed", async () => {
      const mom = await signedIn('<b>"x"</b>');
      const { task } = LinkTaskResponse.parse((await req(mom, "POST", "/link-tasks", { other_name: "<i>", title: "<script>alert(1)</script>", note: 'javascript:alert(1) "><img src=x>' })).json());
      const page = await app.inject({ method: "GET", url: `/t/${task.code}?lang=en` });
      expect(page.body).not.toContain("<script>alert");
      expect(page.body).not.toContain("<img src=x>");
      expect(page.body).not.toContain("<b>");
      expect(page.body).toContain("&lt;script&gt;");
    });
  });

  describe("household lists for someone not on Zaki", () => {
    const familyList = async () => {
      const mom = await signedIn("منى");
      const dad = await signedIn("كريم");
      const circle = CircleResponse.parse((await req(mom, "POST", "/circles", { kind: "family", name: "البيت" })).json()).circle;
      const { invite } = CreateInviteResponse.parse((await req(mom, "POST", `/circles/${circle.id}/invites`)).json());
      await req(dad, "POST", `/invites/${invite.code}/accept`);
      const { list } = HouseListResponse.parse((await req(mom, "POST", "/lists", { name: "البقالة", place: "grocery", circle_id: circle.id })).json());
      await req(mom, "POST", `/lists/${list.id}/items`, { items: [{ title: "بيض" }, { title: "لبن", qty: "2" }] });
      await flush();
      pushed.length = 0;
      return { mom, dad, list };
    };

    it("one link per list: the shopper sees it, adds, ticks; the family hears about it", async () => {
      const { mom, dad, list } = await familyList();
      const made = await req(mom, "POST", `/lists/${list.id}/link`);
      expect(made.statusCode).toBe(200);
      const { url, share_text } = ListLinkResponse.parse(made.json());
      expect(url).toMatch(/^https:\/\/zaki\.test\/l\/[A-Z0-9]+$/);
      expect(share_text).toContain("«البقالة»");
      expect(share_text).toContain(url);
      expect(ListLinkResponse.parse((await req(dad, "POST", `/lists/${list.id}/link`)).json()).url).toBe(url);
      expect(HouseListResponse.parse((await req(mom, "GET", `/lists/${list.id}`)).json()).list.has_link).toBe(true);

      const path = pathOf(url);
      const page = await app.inject({ method: "GET", url: `${path}?lang=ar` });
      expect(page.statusCode).toBe(200);
      expect(page.body).toContain("بيض");
      expect(page.body).toContain("(2)");
      expect(page.body).toContain("2 حاجات لسه");

      // Adding with a name remembers the name for the next taps.
      const added = await form(`${path}/add?lang=ar`, { things: "عيش، بيض", name: "أحمد" });
      expect(added.statusCode).toBe(303);
      expect(added.headers.location).toBe(`${path}?lang=ar&ok=added`);
      const cookie = String(added.headers["set-cookie"]).split(";")[0]!;
      expect(cookie).toMatch(/^zaki_name=/);
      const items = await prisma.houseListItem.findMany({ where: { listId: list.id }, orderBy: { createdAt: "asc" } });
      expect(items.map((i) => i.title)).toEqual(["بيض", "لبن", "عيش"]);
      expect(items[2]!.addedByName).toBe("أحمد");
      expect((await chat(mom)).at(-1)).toBe("🛒 «البقالة»: اتضاف عيش (من أحمد)");
      expect((await chat(dad)).at(-1)).toBe("🛒 «البقالة»: اتضاف عيش (من أحمد)");
      expect(pushed).toHaveLength(0);

      // Ticking: the app shows who got it; the last one tells everyone, with a push.
      for (const item of items.slice(0, 2)) await form(`${path}/tick?lang=ar`, { item: item.id, done: "1" }, { cookie });
      await flush();
      expect(pushed).toHaveLength(0);
      const after = HouseListResponse.parse((await req(dad, "GET", `/lists/${list.id}`)).json()).list;
      expect(after.items.find((i) => i.title === "بيض")).toMatchObject({ done: true, done_by_name: "أحمد" });
      expect(after.items.find((i) => i.title === "عيش")).toMatchObject({ done: false, added_by_name: "أحمد" });
      const last = await form(`${path}/tick?lang=ar`, { item: items[2]!.id, done: "1" }, { cookie });
      expect(last.headers.location).toBe(`${path}?lang=ar&ok=alldone`);
      await flush();
      expect((await chat(mom)).at(-1)).toBe("✅ «البقالة» خلصت كلها: 3 حاجات (مع أحمد)");
      expect(pushed.map((p) => p.to).sort()).toHaveLength(2);

      // Undo a tick from the page.
      await form(`${path}/tick?lang=ar`, { item: items[0]!.id, done: "0" });
      expect((await prisma.houseListItem.findUniqueOrThrow({ where: { id: items[0]!.id } })).doneAt).toBeNull();
    });

    it("stops working when the link is stopped; a new link is a new code", async () => {
      const { mom, list } = await familyList();
      const { url } = ListLinkResponse.parse((await req(mom, "POST", `/lists/${list.id}/link`)).json());
      const stopped = await req(mom, "DELETE", `/lists/${list.id}/link`);
      expect(HouseListResponse.parse(stopped.json()).list.has_link).toBe(false);
      expect((await app.inject({ method: "GET", url: pathOf(url) })).statusCode).toBe(404);
      expect((await form(`${pathOf(url)}/add`, { things: "x" })).statusCode).toBe(404);
      expect(await prisma.houseListItem.count({ where: { listId: list.id } })).toBe(2);
      const fresh = ListLinkResponse.parse((await req(mom, "POST", `/lists/${list.id}/link`)).json());
      expect(fresh.url).not.toBe(url);
    });

    it("only people who see the list can make or stop its link; a stranger's item id does nothing", async () => {
      const { mom, list } = await familyList();
      const stranger = await signedIn("غريب");
      expect((await req(stranger, "POST", `/lists/${list.id}/link`)).statusCode).toBe(404);
      expect((await req(stranger, "DELETE", `/lists/${list.id}/link`)).statusCode).toBe(404);
      const { list: other } = HouseListResponse.parse((await req(stranger, "POST", "/lists", { name: "بتاعتي", place: "grocery" })).json());
      const theirs = HouseListResponse.parse((await req(stranger, "POST", `/lists/${other.id}/items`, { items: [{ title: "سر" }] })).json()).list.items[0]!;
      const { url } = ListLinkResponse.parse((await req(mom, "POST", `/lists/${list.id}/link`)).json());
      await form(`${pathOf(url)}/tick`, { item: theirs.id, done: "1" });
      expect((await prisma.houseListItem.findUniqueOrThrow({ where: { id: theirs.id } })).doneAt).toBeNull();
      // The page shows only this list.
      expect((await app.inject({ method: "GET", url: pathOf(url) })).body).not.toContain("سر");
    });
  });
});
