import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { CareHistoryResponse, CareMed, CareMedResponse, CircleResponse, CreateInviteResponse, ExportResponse, ListMessagesResponse, MeResponse } from "@fakkarni/shared";
import { buildApp } from "../app";
import { runCareTick } from "../care/tick";
import type { PushMessage, PushSender } from "../proactive/push";
import { hasTestDb, resetDb, testPrisma } from "../../test/db";

const SECRET = "test-secret-at-least-32-characters-long!!";
const token = (sub: string) =>
  new SignJWT({ role: "authenticated" }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setAudience("authenticated").setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

describe.skipIf(!hasTestDb)("care circles", () => {
  const prisma = testPrisma();
  // Thu 2026-11-26 12:00 in Cairo (UTC+2).
  let clock = new Date("2026-11-26T10:00:00Z");
  const pushed: PushMessage[] = [];
  const push: PushSender = async (m) => {
    pushed.push(...m);
    return { invalidTokens: [], sent: m.length };
  };
  const app = buildApp({ logger: false }, { prisma, now: () => clock, rateLimitPerMinute: false, auth: { supabaseJwtSecret: SECRET, allowInstallId: true }, invites: { publicUrl: "https://zaki.test" }, push });
  const tick = () => runCareTick({ prisma, push }, clock);
  beforeEach(async () => {
    await resetDb(prisma);
    clock = new Date("2026-11-26T10:00:00Z");
    pushed.length = 0;
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  type H = Record<string, string> & { id: string };
  const signedIn = async (name: string, language?: "en"): Promise<H> => {
    const h = { authorization: `Bearer ${await token(randomUUID())}`, "x-message-kinds": "2" };
    const res = await app.inject({ method: "PATCH", url: "/me", headers: h, payload: { name, timezone: "Africa/Cairo", ...(language ? { language } : {}) } });
    const id = MeResponse.parse(res.json()).user.id;
    await prisma.device.create({ data: { userId: id, platform: "android", pushToken: `ExponentPushToken[${id}]` } });
    return Object.defineProperty({ ...h }, "id", { value: id, enumerable: false }) as unknown as H;
  };
  const req = (h: H, method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: object) => app.inject({ method, url, headers: h, ...(payload ? { payload } : {}) });
  const flush = () => new Promise((r) => setTimeout(r, 50));
  const family = async () => {
    const kareem = await signedIn("كريم");
    const mona = await signedIn("منى");
    const circle = CircleResponse.parse((await req(kareem, "POST", "/circles", { kind: "family", name: "العيلة" })).json()).circle;
    const { invite } = CreateInviteResponse.parse((await req(kareem, "POST", `/circles/${circle.id}/invites`)).json());
    await req(mona, "POST", `/invites/${invite.code}/accept`);
    await flush();
    pushed.length = 0;
    return { kareem, mona, circleId: circle.id };
  };
  const meds = async (h: H) => ((await req(h, "GET", "/care")).json() as { meds: unknown[] }).meds.map((m) => CareMed.parse(m));
  const chat = async (h: H) => ListMessagesResponse.parse((await req(h, "GET", "/messages")).json()).messages;
  const careLines = async (h: H) => (await chat(h)).filter((m) => m.client_id.startsWith("care:"));

  const addMama = async (h: H, circleId: string, extra: object = {}) => {
    const res = await req(h, "POST", "/care/meds", { circle_id: circleId, person_name: "ماما", name: "كونكور", dose: "حباية", times: ["20:00", "08:00", "08:00"], ...extra });
    expect(res.statusCode).toBe(201);
    return CareMedResponse.parse(res.json()).med;
  };

  it("adds a parent's medicine: sorted times, the family sees it, outsiders don't, a resend is the same medicine", async () => {
    const { kareem, mona, circleId } = await family();
    const stranger = await signedIn("غريب");
    const id = randomUUID();
    const med = await addMama(kareem, circleId, { id, remind_user_ids: [kareem.id, mona.id, stranger.id] });
    expect(med.times).toEqual(["08:00", "20:00"]);
    expect(med.remind_user_ids.sort()).toEqual([kareem.id, mona.id].sort());
    // Added at noon: the 8 AM dose of today is not shown as missed; tonight's waits.
    expect(med.today.map((d) => [d.time, d.state])).toEqual([["20:00", "later"]]);
    expect(med.can_delete).toBe(true);
    const again = await req(kareem, "POST", "/care/meds", { id, circle_id: circleId, person_name: "ماما", name: "كونكور", times: ["08:00"] });
    expect(again.statusCode).toBe(200);
    expect((await meds(mona)).map((m) => [m.name, m.circle_name, m.can_delete])).toEqual([["كونكور", "العيلة", false]]);
    expect(await meds(stranger)).toEqual([]);
    expect((await req(stranger, "POST", "/care/meds", { circle_id: circleId, person_name: "x", name: "y", times: ["08:00"] })).statusCode).toBe(422);
    // Mona hears it first, so the first reminder is no surprise.
    const lines = await careLines(mona);
    expect(lines.map((m) => m.text)).toEqual(["💊 اتضافت مواعيد كونكور بتاع ماما (8:00 ص، 8:00 م) من كريم. هفكّرك في المواعيد دي."]);
    expect(await careLines(kareem)).toEqual([]);
    expect(pushed.map((p) => p.to)).toEqual([`ExponentPushToken[${mona.id}]`]);
  });

  it("reminds at dose time once, tells the family when nobody marked it, and tells them again when it is marked", async () => {
    const { kareem, mona, circleId } = await family();
    const med = await addMama(kareem, circleId, { remind_user_ids: [kareem.id], missed_after_minutes: 60 });
    pushed.length = 0;
    clock = new Date("2026-11-26T17:59:00Z");
    expect(await tick()).toBe(0);
    clock = new Date("2026-11-26T18:01:00Z"); // 20:01 Cairo
    expect(await tick()).toBe(1);
    expect(await tick()).toBe(0);
    const [remind] = await careLines(kareem);
    expect(remind!.text).toBe("💊 ميعاد دوا ماما: كونكور (حباية) · 8:00 م");
    expect(remind!.actions.map((a) => [a.kind, a.status, a.label])).toEqual([["care_taken", "pending", "اتاخد؟"]]);
    expect(await careLines(mona)).toEqual([]);
    expect(pushed).toHaveLength(1);
    expect((await meds(kareem))[0]!.today[0]!.state).toBe("due");

    clock = new Date("2026-11-26T19:00:00Z"); // an hour after: missed
    expect(await tick()).toBe(2);
    expect(await tick()).toBe(0);
    expect((await careLines(mona)).map((m) => m.text)).toEqual(["⏰ دوا ماما بتاع 8:00 م (كونكور) لسه محدش علّم إنه اتاخد. حد يطمّن؟"]);
    const seen = (await meds(mona))[0]!;
    expect(seen.today[0]!.state).toBe("missed");

    // Mona checked on Mama and marks it: Kareem hears it.
    pushed.length = 0;
    const marked = await req(mona, "POST", `/care/meds/${med.id}/doses`, { due_at: seen.today[0]!.due_at, status: "taken" });
    expect(marked.statusCode).toBe(200);
    expect(CareMedResponse.parse(marked.json()).med.today[0]).toMatchObject({ state: "taken", by_name: "منى", by_me: true });
    expect((await meds(kareem))[0]!.today[0]).toMatchObject({ state: "taken", by_name: "منى", by_me: false });
    expect((await careLines(kareem)).at(-1)!.text).toBe("✅ دوا ماما بتاع 8:00 م (كونكور) اتاخد، الحمد لله (من منى)");
    await flush();
    expect(pushed.map((p) => p.to)).toEqual([`ExponentPushToken[${kareem.id}]`]);

    // Taking the mark back reopens it (no new line).
    const open = await req(mona, "POST", `/care/meds/${med.id}/doses`, { due_at: seen.today[0]!.due_at, status: "open" });
    expect(CareMedResponse.parse(open.json()).med.today[0]!.state).toBe("missed");
  });

  it("the reminder's card marks the dose by tap", async () => {
    const { kareem, circleId } = await family();
    await addMama(kareem, circleId);
    clock = new Date("2026-11-26T18:00:30Z");
    await tick();
    const [line] = await careLines(kareem);
    const card = line!.actions[0]!;
    const res = await req(kareem, "POST", `/messages/${line!.id}/actions/${card.id}`, { confirm: true });
    expect(res.statusCode).toBe(200);
    const med = (await meds(kareem))[0]!;
    expect(med.today[0]).toMatchObject({ state: "taken", by_me: true });
    // Nobody else is told (no missed line went out), and the tick sends nothing more.
    clock = new Date("2026-11-26T19:30:00Z");
    expect(await tick()).toBe(0);
  });

  it("the parent in the circle gets their own reminder; the missed line goes to the others only", async () => {
    const { kareem, mona, circleId } = await family();
    await addMama(kareem, circleId, { person_user_id: mona.id, person_name: "ماما منى" });
    const med = (await meds(mona))[0]!;
    expect(med).toMatchObject({ for_me: true, remind_user_ids: [mona.id] });
    clock = new Date("2026-11-26T18:00:00Z");
    await tick();
    expect((await careLines(mona)).at(-1)!.text).toBe("💊 ميعاد دواك: كونكور (حباية) · 8:00 م");
    clock = new Date("2026-11-26T19:05:00Z");
    expect(await tick()).toBe(1);
    expect((await careLines(kareem)).map((m) => m.text)).toEqual(["⏰ دوا ماما منى بتاع 8:00 م (كونكور) لسه محدش علّم إنه اتاخد. حد يطمّن؟"]);
  });

  it("English words, no stale reminders after an outage, and old misses wait in open_missed", async () => {
    const sara = await signedIn("Sara", "en");
    const circle = CircleResponse.parse((await req(sara, "POST", "/circles", { kind: "family", name: "Home" })).json()).circle;
    clock = new Date("2026-11-26T04:00:00Z"); // 06:00 Cairo
    await req(sara, "POST", "/care/meds", { circle_id: circle.id, person_name: "Dad", name: "Metformin", times: ["08:00"] });
    // The server was down at 8: at 8:30 the reminder is stale, the missed line (after 60 min) is not.
    clock = new Date("2026-11-26T06:30:00Z");
    expect(await tick()).toBe(0);
    clock = new Date("2026-11-26T07:10:00Z");
    expect(await tick()).toBe(1);
    expect((await careLines(sara)).map((m) => m.text)).toEqual(["⏰ Dad's 8:00 AM Metformin isn't marked as taken yet. Can someone check?"]);
    // The next morning, before 8, yesterday's miss still waits for an answer.
    clock = new Date("2026-11-27T05:00:00Z");
    const med = (await meds(sara))[0]!;
    expect(med.open_missed.map((d) => d.due_at)).toEqual(["2026-11-26T06:00:00.000Z"]);
    expect(med.week).toEqual({ taken: 0, skipped: 0, missed: 1 });
    const hist = CareHistoryResponse.parse((await req(sara, "GET", `/care/meds/${med.id}/history`)).json());
    expect(hist.days.map((d) => [d.date, d.doses.map((x) => x.state)])).toEqual([
      ["2026-11-27", ["later"]],
      ["2026-11-26", ["missed"]],
    ]);
  });

  it("marks only real dose times inside a day; edits, pauses and deletes with the right people", async () => {
    const { kareem, mona, circleId } = await family();
    const med = await addMama(kareem, circleId);
    expect((await req(mona, "POST", `/care/meds/${med.id}/doses`, { due_at: "2026-11-26T18:30:00Z", status: "taken" })).statusCode).toBe(422);
    clock = new Date("2026-11-28T10:00:00Z");
    expect((await req(mona, "POST", `/care/meds/${med.id}/doses`, { due_at: "2026-11-26T18:00:00Z", status: "taken" })).statusCode).toBe(422);

    const edited = await req(mona, "PATCH", `/care/meds/${med.id}`, { times: ["09:00"], dose: "", active: false });
    expect(CareMedResponse.parse(edited.json()).med).toMatchObject({ times: ["09:00"], dose: null, active: false, open_missed: [] });
    expect((await req(mona, "PATCH", `/care/meds/${med.id}`, { remind_user_ids: [randomUUID()] })).statusCode).toBe(422);
    clock = new Date("2026-11-29T07:00:00Z");
    expect(await tick()).toBe(0); // paused

    expect((await req(mona, "DELETE", `/care/meds/${med.id}`)).statusCode).toBe(403);
    expect((await req(kareem, "DELETE", `/care/meds/${med.id}`)).statusCode).toBe(204);
    expect(await meds(mona)).toEqual([]);
  });

  it("export, leaving the circle and /bootstrap", async () => {
    const { kareem, mona, circleId } = await family();
    await addMama(kareem, circleId, { remind_user_ids: [kareem.id, mona.id] });
    const exp = ExportResponse.parse((await req(kareem, "GET", "/me/export")).json());
    expect(exp.care_meds.map((m) => [m.person, m.name, m.added])).toEqual([["ماما", "كونكور", true]]);
    const boot = (await req(kareem, "GET", "/bootstrap")).json() as { parts: Record<string, string> };
    expect(JSON.parse(boot.parts["/care"]!).meds).toHaveLength(1);
    await req(mona, "DELETE", `/circles/${circleId}/members/${mona.id}`);
    const left = await prisma.careMed.findFirstOrThrow({});
    expect(left.remindUserIds).toEqual([kareem.id]);
  });
});
