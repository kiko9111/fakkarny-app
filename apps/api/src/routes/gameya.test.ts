import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { CircleResponse, CreateInviteResponse, ExportResponse, Gameya, GameyaRemindResponse, GameyaResponse, ListMessagesResponse, MeResponse, PostMessageResponse } from "@fakkarni/shared";
import { buildApp } from "../app";
import type { FriendModel } from "../ai/model";
import { createConversationPipeline } from "../pipeline/conversation";
import type { PushMessage } from "../proactive/push";
import { tickUser } from "../proactive/tick";
import { hasTestDb, resetDb, testPrisma } from "../../test/db";

const SECRET = "test-secret-at-least-32-characters-long!!";
const token = (sub: string) =>
  new SignJWT({ role: "authenticated" }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setAudience("authenticated").setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

describe.skipIf(!hasTestDb)("the gam'eya book", () => {
  const prisma = testPrisma();
  // Wednesday 2 December 2026, 12:00 Cairo.
  let clock = new Date("2026-12-02T10:00:00Z");
  const pushed: PushMessage[] = [];
  const model: FriendModel = {
    async respond() {
      throw new Error("the gam'eya never needs the model");
    },
    async complete() {
      return { text: "", usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } };
    },
  };
  const push = async (m: PushMessage[]) => {
    pushed.push(...m);
    return { invalidTokens: [], sent: m.length };
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
      push,
    },
  );
  beforeEach(async () => {
    await resetDb(prisma);
    clock = new Date("2026-12-02T10:00:00Z");
    pushed.length = 0;
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  type H = Record<string, string> & { id: string };
  const signedIn = async (name: string): Promise<H> => {
    const h = { authorization: `Bearer ${await token(randomUUID())}`, "x-message-kinds": "2" };
    const res = await app.inject({ method: "PATCH", url: "/me", headers: h, payload: { name } });
    const id = MeResponse.parse(res.json()).user.id;
    await prisma.device.create({ data: { userId: id, platform: "android", pushToken: `ExponentPushToken[${id}]` } });
    return Object.defineProperty({ ...h }, "id", { value: id, enumerable: false }) as unknown as H;
  };
  const req = (h: H, method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: object) => app.inject({ method, url, headers: h, ...(payload ? { payload } : {}) });
  const flush = () => new Promise((r) => setTimeout(r, 50));
  const chatOf = async (h: H) => ListMessagesResponse.parse((await req(h, "GET", "/messages")).json()).messages;
  const say = async (h: H, text: string) => {
    const res = await req(h, "POST", "/messages", { client_id: randomUUID(), text, created_at: clock.toISOString(), timezone: "Africa/Cairo" });
    expect(res.statusCode).toBe(201);
    return PostMessageResponse.parse(res.json());
  };

  /** Kareem organizes; Mona is in his circle; Sara is a name only. */
  const setup = async () => {
    const kareem = await signedIn("كريم");
    const mona = await signedIn("منى");
    const circle = CircleResponse.parse((await req(kareem, "POST", "/circles", { kind: "family", name: "البيت" })).json()).circle;
    const { invite } = CreateInviteResponse.parse((await req(kareem, "POST", `/circles/${circle.id}/invites`)).json());
    await req(mona, "POST", `/invites/${invite.code}/accept`);
    await flush();
    pushed.length = 0;
    const id = randomUUID();
    const res = await req(kareem, "POST", "/gameyas", {
      id,
      name: "جمعية البيت",
      amount: 1000,
      pay_day: 5,
      start_month: "2026-12",
      circle_id: circle.id,
      members: [{ name: "كريم", user_id: kareem.id }, { name: "منى", user_id: mona.id }, { name: "سارة" }],
    });
    expect(res.statusCode).toBe(201);
    const g = GameyaResponse.parse(res.json()).gameya;
    await flush();
    return { kareem, mona, circleId: circle.id, g };
  };

  it("makes a book: turns by month, the pot, members told with their turn, resend is the same", async () => {
    const { kareem, mona, circleId, g } = await setup();
    expect(g.months).toBe(3);
    expect(g.pot).toBe(3000);
    expect(g.round).toBe(1);
    expect(g.members.map((m) => [m.turn, m.name, m.month])).toEqual([
      [1, "كريم", "2026-12"],
      [2, "منى", "2027-01"],
      [3, "سارة", "2027-02"],
    ]);
    expect(g.mine).toBe(true);
    expect(g.url).toBe(`https://zaki.test/g/${g.code}`);
    // Mona hears she is in, with her turn, and gets a push.
    const line = (await chatOf(mona)).find((m) => m.client_id === `gameya:${g.id}:joined:${mona.id}`);
    expect(line?.text).toContain("دورك رقم 2");
    expect(line?.actions[0]?.route).toBe(`/gameya/${g.id}`);
    expect(pushed.some((p) => p.to.includes(mona.id))).toBe(true);
    // Mona sees it, not as organizer, with her own row marked.
    const seen = Gameya.parse(((await req(mona, "GET", "/gameyas")).json() as { gameyas: unknown[] }).gameyas[0]);
    expect(seen.mine).toBe(false);
    expect(seen.members.find((m) => m.is_me)?.name).toBe("منى");
    // A resend of the same id answers with the same book.
    const again = await req(kareem, "POST", "/gameyas", { id: g.id, name: "x", amount: 1, pay_day: 1, start_month: "2026-12", circle_id: circleId, members: [{ name: "a" }, { name: "b" }] });
    expect(again.statusCode).toBe(200);
    expect(GameyaResponse.parse(again.json()).gameya.name).toBe("جمعية البيت");
    // A stranger sees nothing and can't tick.
    const stranger = await signedIn("غريب");
    expect((await req(stranger, "GET", `/gameyas/${g.id}`)).statusCode).toBe(404);
    expect((await req(stranger, "POST", `/gameyas/${g.id}/paid`, { member_id: g.members[0]!.id, round: 1, paid: true })).statusCode).toBe(404);
  });

  it("drops a user id that is not in the circle", async () => {
    const kareem = await signedIn("كريم");
    const other = await signedIn("بره");
    const res = await req(kareem, "POST", "/gameyas", { name: "ج", amount: 500, pay_day: 1, start_month: "2026-12", members: [{ name: "كريم", user_id: kareem.id }, { name: "بره", user_id: other.id }] });
    const g = GameyaResponse.parse(res.json()).gameya;
    expect(g.members.map((m) => m.user_id)).toEqual([kareem.id, null]);
    expect((await req(other, "GET", "/gameyas")).json()).toEqual({ gameyas: [] });
  });

  it("payments: a member ticks their own (organizer told), not others'; all paid tells the organizer to hand over", async () => {
    const { kareem, mona, g } = await setup();
    const [k, m, s] = g.members;
    expect((await req(mona, "POST", `/gameyas/${g.id}/paid`, { member_id: s!.id, round: 1, paid: true })).statusCode).toBe(403);
    pushed.length = 0;
    const after = GameyaResponse.parse((await req(mona, "POST", `/gameyas/${g.id}/paid`, { member_id: m!.id, round: 1, paid: true })).json()).gameya;
    expect(after.payments).toEqual([{ member_id: m!.id, round: 1 }]);
    await flush();
    const told = (await chatOf(kareem)).find((x) => x.client_id === `gameya:${g.id}:paid:${m!.id}:1`);
    expect(told?.text).toContain("منى");
    expect(pushed.some((p) => p.to.includes(kareem.id))).toBe(true);
    // The organizer ticks the rest; Mona already paid, so a tick of hers changes nothing.
    await req(kareem, "POST", `/gameyas/${g.id}/paid`, { member_id: k!.id, round: 1, paid: true });
    const last = GameyaResponse.parse((await req(kareem, "POST", `/gameyas/${g.id}/paid`, { member_id: s!.id, round: 1, paid: true })).json()).gameya;
    expect(last.payments).toHaveLength(3);
    const all = (await chatOf(kareem)).find((x) => x.client_id === `gameya:${g.id}:1:allpaid`);
    expect(all?.text).toContain("سلّم كريم");
    // Untick works for the organizer.
    const undone = GameyaResponse.parse((await req(kareem, "POST", `/gameyas/${g.id}/paid`, { member_id: s!.id, round: 1, paid: false })).json()).gameya;
    expect(undone.payments).toHaveLength(2);
    // Amount and members are locked once someone paid; the name is not.
    expect((await req(kareem, "PATCH", `/gameyas/${g.id}`, { amount: 2000 })).statusCode).toBe(422);
    expect(GameyaResponse.parse((await req(kareem, "PATCH", `/gameyas/${g.id}`, { name: "جمعية العيلة" })).json()).gameya.name).toBe("جمعية العيلة");
    // Mona can't change the book.
    expect((await req(mona, "PATCH", `/gameyas/${g.id}`, { name: "x" })).statusCode).toBe(404);
  });

  it("reorders turns before the first payment and tells a newly added member", async () => {
    const { kareem, g } = await setup();
    const ids = g.members.map((m) => ({ id: m.id, name: m.name, user_id: m.user_id }));
    const swapped = GameyaResponse.parse((await req(kareem, "PATCH", `/gameyas/${g.id}`, { members: [ids[2], ids[0], ids[1]] })).json()).gameya;
    expect(swapped.members.map((m) => m.name)).toEqual(["سارة", "كريم", "منى"]);
    expect(swapped.members[0]!.id).toBe(ids[2]!.id);
  });

  it("the pot handed over: the receiver tells the organizer", async () => {
    const { kareem, mona, g } = await setup();
    expect((await req(mona, "POST", `/gameyas/${g.id}/received`, { round: 1, received: true })).statusCode).toBe(403);
    const r = GameyaResponse.parse((await req(mona, "POST", `/gameyas/${g.id}/received`, { round: 2, received: true })).json()).gameya;
    expect(r.members[1]!.received).toBe(true);
    expect((await chatOf(kareem)).some((x) => x.client_id === `gameya:${g.id}:2:received`)).toBe(true);
  });

  it("remind: Zaki members who haven't paid hear it once per 12 hours; WhatsApp text for the rest", async () => {
    const { kareem, mona, g } = await setup();
    const first = GameyaRemindResponse.parse((await req(kareem, "POST", `/gameyas/${g.id}/remind`)).json());
    expect(first.reminded).toBe(1);
    expect(first.share_text).toContain("سارة");
    expect(first.share_text).toContain(g.url);
    expect(GameyaRemindResponse.parse((await req(kareem, "POST", `/gameyas/${g.id}/remind`)).json()).reminded).toBe(0);
    expect((await chatOf(mona)).filter((x) => x.client_id?.includes(":nudge:")).length).toBe(1);
    expect((await req(mona, "POST", `/gameyas/${g.id}/remind`)).statusCode).toBe(404);
  });

  it("the public page shows the turns, and 'I paid' from the link tells the organizer", async () => {
    const { kareem, g } = await setup();
    const page = await app.inject({ method: "GET", url: `/g/${g.code.toLowerCase()}` });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain("جمعية البيت");
    expect(page.body).toContain("سارة");
    expect(page.body).toContain("القبض الشهر ده لـ <strong>كريم</strong>");
    const sara = g.members[2]!;
    const paid = await app.inject({ method: "POST", url: `/g/${g.code}/paid`, headers: { "content-type": "application/x-www-form-urlencoded" }, payload: `who=${sara.id}` });
    expect(paid.body).toContain("اتسجّل إنك دفعت");
    expect((await chatOf(kareem)).find((x) => x.client_id === `gameya:${g.id}:paid:${sara.id}:1`)?.text).toContain("من اللينك");
    const again = await app.inject({ method: "POST", url: `/g/${g.code}/paid`, headers: { "content-type": "application/x-www-form-urlencoded" }, payload: `who=${sara.id}` });
    expect(again.body).toContain("خلاص");
    expect((await app.inject({ method: "GET", url: "/g/NOPE1234" })).statusCode).toBe(404);
  });

  it("chat: 'دفعت الجمعية' records the user's own payment, 'الدور على مين' tells where it stands, 'اعمل جمعية' opens the form", async () => {
    const { kareem, mona, g } = await setup();
    const paid = await say(mona, "دفعت الجمعية");
    expect(paid.replies[0]!.text).toContain("سجّلت إنك دفعت قسط ديسمبر 2026");
    const book = GameyaResponse.parse((await req(mona, "GET", `/gameyas/${g.id}`)).json()).gameya;
    expect(book.payments).toEqual([{ member_id: g.members[1]!.id, round: 1 }]);
    await flush();
    expect((await chatOf(kareem)).some((x) => x.client_id === `gameya:${g.id}:paid:${g.members[1]!.id}:1`)).toBe(true);
    expect((await say(mona, "دفعت الجمعية")).replies[0]!.text).toContain("متسجّل");
    const stand = await say(kareem, "الجمعية الدور على مين؟");
    expect(stand.replies[0]!.text).toContain("القبض لـ كريم");
    const made = await say(kareem, "عايز اعمل جمعية");
    expect(made.replies[0]!.actions[0]?.route).toBe("/gameya/new");
  });

  it("the tick: the day before pay day each Zaki member who hasn't paid hears it; pay day evening the organizer hears who's left", async () => {
    const { kareem, mona, g } = await setup();
    const userOf = (id: string) => prisma.user.findUniqueOrThrow({ where: { id } });
    // 4 December, 13:00 Cairo: pay day is the 5th.
    clock = new Date("2026-12-04T11:00:00Z");
    await req(kareem, "POST", `/gameyas/${g.id}/paid`, { member_id: g.members[0]!.id, round: 1, paid: true });
    pushed.length = 0;
    await tickUser({ prisma, push }, await userOf(mona.id), clock);
    await tickUser({ prisma, push }, await userOf(kareem.id), clock);
    const due = (await chatOf(mona)).find((x) => x.client_id === `gameya:${g.id}:1:due:${mona.id}`);
    expect(due?.text).toContain("بكرة ميعاد قسط");
    expect(due?.text).toContain("القبض الشهر ده لـ كريم");
    // Kareem already paid: nothing for him the day before.
    expect((await chatOf(kareem)).some((x) => x.client_id === `gameya:${g.id}:1:due:${kareem.id}`)).toBe(false);
    expect(pushed.some((p) => p.to.includes(mona.id))).toBe(true);
    // Once only.
    await tickUser({ prisma, push }, await userOf(mona.id), new Date(clock.getTime() + 3600_000));
    expect((await chatOf(mona)).filter((x) => x.client_id === `gameya:${g.id}:1:due:${mona.id}`)).toHaveLength(1);
    // 5 December, 19:00 Cairo.
    clock = new Date("2026-12-05T17:00:00Z");
    await tickUser({ prisma, push }, await userOf(kareem.id), clock);
    const day = (await chatOf(kareem)).find((x) => x.client_id === `gameya:${g.id}:1:ownerday`);
    expect(day?.text).toContain("دفع 1 من 3");
    expect(day?.text).toContain("منى");
  });

  it("export holds the gam'eya; deleting the organizer's account hands the book to the next Zaki member", async () => {
    const { kareem, mona, g } = await setup();
    const exp = ExportResponse.parse((await req(mona, "GET", "/me/export")).json());
    expect(exp.gameyas[0]).toMatchObject({ name: "جمعية البيت", role: "member" });
    expect((await req(kareem, "DELETE", "/me")).statusCode).toBe(204);
    const seen = GameyaResponse.parse((await req(mona, "GET", `/gameyas/${g.id}`)).json()).gameya;
    expect(seen.mine).toBe(true);
    expect(seen.members[0]!.user_id).toBeNull();
  });
});
