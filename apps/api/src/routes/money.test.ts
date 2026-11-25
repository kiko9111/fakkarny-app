import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { CircleResponse, CreateInviteResponse, ExportResponse, ListMessagesResponse, MeResponse, MoneyOverview, MonthGift, PostMessageResponse, SectionDetail, SectionResponse } from "@fakkarni/shared";
import { buildApp } from "../app";
import type { FriendModel } from "../ai/model";
import { createConversationPipeline } from "../pipeline/conversation";
import { sendMonthGift } from "../proactive/tick";
import { hasTestDb, resetDb, testPrisma } from "../../test/db";

const SECRET = "test-secret-at-least-32-characters-long!!";
const token = (sub: string) =>
  new SignJWT({ role: "authenticated" }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setAudience("authenticated").setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

/** A model that must never be called: everything here is rules. */
const noModel: FriendModel = {
  respond: async () => {
    throw new Error("the model should not be called");
  },
  complete: async () => {
    throw new Error("the model should not be called");
  },
};

describe.skipIf(!hasTestDb)("wider Daftar: sections, budgets, shared books", () => {
  const prisma = testPrisma();
  let clock = new Date("2026-11-22T10:00:00Z");
  const app = buildApp(
    { logger: false },
    {
      prisma,
      now: () => clock,
      rateLimitPerMinute: false,
      auth: { supabaseJwtSecret: SECRET, allowInstallId: true },
      invites: { publicUrl: "https://zaki.test" },
      pipeline: createConversationPipeline({ model: noModel }),
      push: async (m) => ({ invalidTokens: [], sent: m.length }),
    },
  );
  beforeEach(async () => {
    await resetDb(prisma);
    clock = new Date("2026-11-22T10:00:00Z");
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  type H = Record<string, string>;
  const signedIn = async (name: string): Promise<H & { id: string }> => {
    const h = { authorization: `Bearer ${await token(randomUUID())}` };
    const res = await app.inject({ method: "PATCH", url: "/me", headers: h, payload: { name, timezone: "Africa/Cairo" } });
    return Object.defineProperty({ ...h }, "id", { value: MeResponse.parse(res.json()).user.id, enumerable: false }) as unknown as H & { id: string };
  };
  const post = (h: H, url: string, payload?: object) => app.inject({ method: "POST", url, headers: h, ...(payload ? { payload } : {}) });
  const get = (h: H, url: string) => app.inject({ method: "GET", url, headers: h });
  const chat = async (h: H) => ListMessagesResponse.parse((await app.inject({ method: "GET", url: "/messages", headers: { ...h, "x-message-kinds": "2" } })).json()).messages;
  const say = async (h: H, text: string) => PostMessageResponse.parse((await post(h, "/messages", { client_id: randomUUID(), text, created_at: clock.toISOString() })).json());
  const section = async (h: H, body: object) => SectionResponse.parse((await post(h, "/money/sections", body)).json()).section;

  it("starts empty, logs to user-made sections and warns near the monthly budget", async () => {
    const mona = await signedIn("منى");
    expect(MoneyOverview.parse((await get(mona, "/money")).json())).toEqual({ month: "2026-11", sections: [], totals: { expense: 0, income: 0 } });

    const car = await section(mona, { name: "العربية", budget: 1000 });
    await section(mona, { name: "المرتب", kind: "income" });
    await post(mona, `/money/sections/${car.id}/entries`, { amount: 500, note: "بنزين" });
    await post(mona, `/money/sections/${car.id}/entries`, { amount: 350, note: "غسيل" });
    // 850 of 1000: one gentle warning in her chat.
    expect((await chat(mona)).filter((m) => m.kind === "update").map((m) => m.text)).toEqual(["للعلم بس: «العربية» وصل 850 من 1,000 الشهر ده. فاضل 150 🌱"]);

    // From chat, by rules: the note went to «العربية» last time.
    const reply = await say(mona, "دفعت 300 بنزين");
    expect(reply.replies.map((r) => r.text)).toEqual(["سجّلت 300 جنيه في «العربية». الشهر ده لحد دلوقتي: 1,150."]);
    expect((await chat(mona)).filter((m) => m.kind === "update").at(-1)!.text).toContain("وصل لميزانية الشهر (1,150 من 1,000)");
    await say(mona, "قبضت 9000");
    await say(mona, "صرفت 120 على الأكل"); // no matching section: a catch-all she can rename
    const overview = MoneyOverview.parse((await get(mona, "/money")).json());
    expect(overview.totals).toEqual({ expense: 1270, income: 9000 });
    expect(overview.sections.map((s) => [s.name, s.month_total])).toEqual([["العربية", 1150], ["المرتب", 9000], ["مصاريف", 120]]);

    // Next month starts fresh; the gift looks back on November.
    clock = new Date("2026-12-01T09:00:00Z"); // 11:00 Cairo
    const gift = MonthGift.parse((await get(mona, "/money/gift")).json());
    expect(gift).toMatchObject({ month: "2026-11", expense: 1270, income: 9000 });
    expect(gift.lines[0]).toBe("🎁 هدية آخر الشهر من زكي: ملخّص نوفمبر");
    const user = await prisma.user.findUniqueOrThrow({ where: { id: mona.id } });
    expect(await sendMonthGift({ prisma, model: noModel } as never, user, clock)).toBe(true);
    expect(await sendMonthGift({ prisma, model: noModel } as never, user, clock)).toBe(false);
    expect((await chat(mona)).at(-1)!.text.split("\n")[0]).toBe(gift.lines[0]);

    const exported = ExportResponse.parse((await get(mona, "/me/export")).json());
    expect(exported.money.map((s) => s.name)).toEqual(["العربية", "المرتب", "مصاريف"]);
  });

  it("shares a circle book: everyone adds, splits evenly and sees who pays whom", async () => {
    const mama = await signedIn("ماما");
    const omar = await signedIn("عمر");
    const sara = await signedIn("سارة");
    const outsider = await signedIn("غريب");
    const circle = CircleResponse.parse((await post(mama, "/circles", { kind: "family", name: "البيت" })).json()).circle;
    const { invite } = CreateInviteResponse.parse((await post(mama, `/circles/${circle.id}/invites`)).json());
    await post(omar, `/invites/${invite.code}/accept`);
    await post(sara, `/invites/${invite.code}/accept`);

    const book = await section(mama, { name: "مصاريف البيت", circle_id: circle.id });
    expect(book).toMatchObject({ circle_id: circle.id, circle_name: "البيت", is_owner: true });
    expect((await post(outsider, "/money/sections", { name: "x", circle_id: circle.id })).statusCode).toBe(400);
    expect((await get(outsider, `/money/sections/${book.id}`)).statusCode).toBe(404);

    await post(mama, `/money/sections/${book.id}/entries`, { amount: 300, note: "خضار" });
    await post(omar, `/money/sections/${book.id}/entries`, { amount: 60, note: "عيش" });
    // Omar and Sara hear about Mama's 300 in their chat.
    expect((await chat(sara)).filter((m) => m.kind === "update").map((m) => m.text)).toEqual(["ماما: 300 جنيه في «مصاريف البيت». نصيبك 100.", "عمر: 60 جنيه في «مصاريف البيت». نصيبك 20."]);

    const detail = SectionDetail.parse((await get(sara, `/money/sections/${book.id}`)).json());
    expect(detail.section).toMatchObject({ month_total: 360, my_share: 120, is_owner: false });
    expect(detail.settle).toEqual([
      { from_name: "سارة", to_name: "ماما", amount: 120, from_me: true, to_me: false },
      { from_name: "عمر", to_name: "ماما", amount: 60, from_me: false, to_me: false },
    ]);
    // Sara's own totals count her share, not the whole book.
    expect(MoneyOverview.parse((await get(sara, "/money")).json()).totals.expense).toBe(120);
    // Only the owner renames or deletes; anyone deletes only their own entries.
    expect((await app.inject({ method: "PATCH", url: `/money/sections/${book.id}`, headers: omar, payload: { name: "y" } })).statusCode).toBe(403);
    const mamaEntry = detail.entries.find((e) => e.payer_name === "ماما")!;
    expect((await app.inject({ method: "DELETE", url: `/money/entries/${mamaEntry.id}`, headers: omar })).statusCode).toBe(404);
    expect((await app.inject({ method: "DELETE", url: `/money/entries/${mamaEntry.id}`, headers: mama })).statusCode).toBe(204);
  });

  it("never makes twin sections, takes phone-made ids, and merges old twins", async () => {
    const mona = await signedIn("منى");
    const id = randomUUID();
    const first = await post(mona, "/money/sections", { id, name: "salary", kind: "income" });
    expect(first.statusCode).toBe(201);
    expect(SectionResponse.parse(first.json()).section.id).toBe(id);
    // The same create sent again (a lost answer) and a "Salary" twin: both get the one section.
    const again = await post(mona, "/money/sections", { id, name: "salary", kind: "income" });
    expect([again.statusCode, SectionResponse.parse(again.json()).section.id]).toEqual([200, id]);
    const twin = await post(mona, "/money/sections", { id: randomUUID(), name: " Salary ", kind: "income" });
    expect([twin.statusCode, SectionResponse.parse(twin.json()).section.id]).toEqual([200, id]);
    // Same name as spending is a different section.
    expect((await post(mona, "/money/sections", { name: "Salary", kind: "expense" })).statusCode).toBe(201);

    // An add with a phone-made id counts once however often it is sent.
    const entryId = randomUUID();
    const add = await post(mona, `/money/sections/${id}/entries`, { id: entryId, amount: 9000 });
    expect(add.statusCode).toBe(201);
    expect(SectionResponse.parse(add.json()).entry?.id).toBe(entryId);
    expect((await post(mona, `/money/sections/${id}/entries`, { id: entryId, amount: 9000 })).statusCode).toBe(200);
    // Someone else's id is refused for good (422, which the phone does not resend).
    const omar = await signedIn("عمر");
    const omarBook = await section(omar, { name: "x" });
    expect((await post(omar, `/money/sections/${omarBook.id}/entries`, { id: entryId, amount: 1 })).statusCode).toBe(422);

    // Twins made before this fix are merged into the oldest on the next look, entries and budget kept.
    const older = await prisma.moneySection.create({ data: { ownerId: mona.id, name: "Car", kind: "expense", createdAt: new Date("2026-11-01T00:00:00Z") } });
    const newer = await prisma.moneySection.create({ data: { ownerId: mona.id, name: "car", kind: "expense", budget: 2000, createdAt: new Date("2026-11-02T00:00:00Z") } });
    await prisma.moneyEntry.create({ data: { sectionId: newer.id, userId: mona.id, amount: 300, at: clock } });
    const overview = MoneyOverview.parse((await get(mona, "/money")).json());
    expect(overview.sections.map((s) => [s.name, s.kind, s.month_total, s.budget])).toEqual([
      ["Car", "expense", 300, 2000],
      ["salary", "income", 9000, null],
      ["Salary", "expense", 0, null],
    ]);
    expect(overview.totals).toEqual({ expense: 300, income: 9000 });
    expect(await prisma.moneySection.findUnique({ where: { id: newer.id } })).toBeNull();
    expect(SectionDetail.parse((await get(mona, `/money/sections/${older.id}`)).json()).entries.map((e) => e.amount)).toEqual([300]);
  });
});
