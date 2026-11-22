import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { INSTALL_ID_HEADER } from "@fakkarni/shared";
import { buildApp } from "../app";
import type { FriendModel } from "../ai/model";
import { localToUtc } from "../lib/time";
import { hasTestDb, resetDb, testPrisma } from "../../test/db";
import type { PushMessage, PushSender } from "./push";
import { runTick } from "./tick";

const usage = { input_tokens: 50, output_tokens: 15, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const at = (local: string) => localToUtc(local, "Africa/Cairo");

describe.skipIf(!hasTestDb)("proactive tick", () => {
  const prisma = testPrisma();
  const pushed: PushMessage[][] = [];
  const push: PushSender = async (msgs) => {
    pushed.push(msgs);
    return { sent: msgs.length, invalidTokens: msgs.filter((m) => m.to === "ExponentPushToken[dead]").map((m) => m.to) };
  };
  const prompts: string[] = [];
  const model: FriendModel = {
    respond: async () => ({ ok: false, reason: "invalid_output", usage }),
    complete: async ({ prompt }) => (prompts.push(prompt), { text: "Sabah el fol ☀️ Did Omar's school bus guy text you yet?", usage }),
  };

  beforeEach(async () => {
    pushed.length = 0;
    prompts.length = 0;
    await resetDb(prisma);
  });
  afterAll(() => prisma.$disconnect());

  async function makeUser(over: Record<string, unknown> = {}) {
    return prisma.user.create({
      data: { authId: `install:${randomUUID()}`, timezone: "Africa/Cairo", lastActiveAt: at("2026-11-18T20:00"), ...over },
    });
  }

  it("sends the good-morning message at wake time, stored in chat and pushed", async () => {
    const user = await makeUser();
    await prisma.device.create({ data: { userId: user.id, platform: "ios", pushToken: "ExponentPushToken[abc]" } });
    await prisma.item.create({ data: { userId: user.id, type: "task", title: "Omar's school bus payment", dueAt: at("2026-11-19T09:00") } });

    expect(await runTick({ prisma, model, push }, at("2026-11-19T07:02"))).toBe(1);
    const msg = await prisma.message.findFirstOrThrow({ where: { userId: user.id } });
    expect(msg).toMatchObject({ role: "friend", kind: "morning" });
    expect(prompts[0]).toContain("Omar's school bus payment");
    expect(pushed[0]![0]).toMatchObject({ to: "ExponentPushToken[abc]", data: { type: "message", kind: "morning" } });

    // Once per day.
    expect(await runTick({ prisma, model, push }, at("2026-11-19T07:10"))).toBe(0);
  });

  it("falls back to a template when the AI fails, and clears dead push tokens", async () => {
    const user = await makeUser();
    await prisma.device.create({ data: { userId: user.id, platform: "android", pushToken: "ExponentPushToken[dead]" } });
    const broken: FriendModel = { ...model, complete: async () => { throw new Error("down"); } };
    await runTick({ prisma, model: broken, push }, at("2026-11-19T07:00"));
    expect((await prisma.message.findFirstOrThrow()).text).toContain("إيه الخطة النهارده"); // default language is Egyptian Arabic
    expect((await prisma.device.findFirstOrThrow()).pushToken).toBeNull();
  });

  it("writes a due reminder into the chat once, without a push, and again only if it is moved", async () => {
    // Mid-morning with nothing else due, so only the reminder is written.
    const user = await makeUser({ lastMorningAt: at("2026-11-22T07:00"), lastCheckinAt: at("2026-11-22T09:30") });
    await prisma.device.create({ data: { userId: user.id, platform: "android", pushToken: "ExponentPushToken[ok]" } });
    const item = await prisma.item.create({
      data: { userId: user.id, type: "reminder", title: "أكلم محمد", nudge: "فاضي دلوقتي تكلم أخوك محمد؟", dueAt: at("2026-11-22T10:30"), remindAt: at("2026-11-22T10:30") },
    });
    await prisma.item.create({ data: { userId: user.id, type: "reminder", title: "Later", remindAt: at("2026-11-22T15:00") } });
    await prisma.item.create({ data: { userId: user.id, type: "reminder", title: "Done", status: "done", remindAt: at("2026-11-22T10:00") } });

    await runTick({ prisma, model, push }, at("2026-11-22T10:29"));
    expect(await prisma.message.count({ where: { kind: "reminder" } })).toBe(0);

    await runTick({ prisma, model, push }, at("2026-11-22T10:30"));
    await runTick({ prisma, model, push }, at("2026-11-22T10:31"));
    const posted = await prisma.message.findMany({ where: { kind: "reminder" } });
    expect(posted.map((m) => m.text)).toEqual(["فاضي دلوقتي تكلم أخوك محمد؟"]);
    expect(posted[0]!.role).toBe("friend");
    expect(pushed).toHaveLength(0); // the phone's local notification already fired

    await prisma.item.update({ where: { id: item.id }, data: { remindAt: at("2026-11-22T11:00") } });
    await runTick({ prisma, model, push }, at("2026-11-22T11:00"));
    expect(await prisma.message.count({ where: { kind: "reminder" } })).toBe(2);
  });

  it("keeps a repeating reminder going, skipping the night", async () => {
    const user = await makeUser({ lastMorningAt: at("2026-11-22T07:00"), lastCheckinAt: at("2026-11-22T21:30"), lastNightAt: at("2026-11-22T22:00") });
    const item = await prisma.item.create({
      data: { userId: user.id, type: "reminder", title: "اشرب مية", nudge: "شربت مية ولا لسه؟", remindAt: at("2026-11-22T21:30"), dueAt: at("2026-11-22T21:30"), repeatEveryMinutes: 60 },
    });
    const remindAt = async () => (await prisma.item.findUniqueOrThrow({ where: { id: item.id } })).remindAt!.toISOString();

    await runTick({ prisma, model, push }, at("2026-11-22T21:30"));
    expect(await remindAt()).toBe(at("2026-11-22T22:30").toISOString());
    await runTick({ prisma, model, push }, at("2026-11-22T22:30"));
    // 23:30 is past the 23:00 bedtime: the next one is 07:30 tomorrow.
    expect(await remindAt()).toBe(at("2026-11-23T07:30").toISOString());
    expect(await prisma.message.count({ where: { kind: "reminder" } })).toBe(2);
    expect((await prisma.item.findUniqueOrThrow({ where: { id: item.id } })).status).toBe("open");
  });

  it("uses a plain line when a reminder has no nudge", async () => {
    const user = await makeUser({ lastMorningAt: at("2026-11-22T07:00"), lastCheckinAt: at("2026-11-22T09:30") });
    await prisma.item.create({ data: { userId: user.id, type: "task", title: "تجديد الباسبور", remindAt: at("2026-11-22T10:00") } });
    await runTick({ prisma, model, push }, at("2026-11-22T10:00"));
    expect((await prisma.message.findFirstOrThrow({ where: { kind: "reminder" } })).text).toBe("فاكر «تجديد الباسبور»؟ ده وقته.");
  });

  it("follows up after an event and marks it followed up", async () => {
    const user = await makeUser({ lastMorningAt: at("2026-11-22T07:00"), lastCheckinAt: at("2026-11-22T19:00") });
    const item = await prisma.item.create({
      data: { userId: user.id, type: "reminder", title: "Dentist", dueAt: at("2026-11-22T18:00"), followUpAt: at("2026-11-22T20:00") },
    });
    await runTick({ prisma, model, push }, at("2026-11-22T20:01"));
    expect((await prisma.message.findFirstOrThrow()).kind).toBe("followup");
    expect((await prisma.item.findUniqueOrThrow({ where: { id: item.id } })).followedUpAt).not.toBeNull();
  });

  it("counts ignored check-ins and resets when the user writes (F7)", async () => {
    const user = await makeUser({ lastMorningAt: at("2026-11-19T07:00"), lastCheckinAt: at("2026-11-19T10:00"), lastUserMessageAt: at("2026-11-19T08:00") });
    await prisma.item.create({ data: { userId: user.id, type: "reminder", title: "4pm meeting", dueAt: at("2026-11-19T16:00") } });
    await runTick({ prisma, model, push }, at("2026-11-19T13:30"));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).ignoredCheckins).toBe(1);

    const app = buildApp({ logger: false }, { prisma, now: () => at("2026-11-19T13:40") });
    await app.inject({ method: "POST", url: "/messages", headers: { [INSTALL_ID_HEADER]: user.authId.replace("install:", "") }, payload: { client_id: "c1", text: "yes ate already", created_at: at("2026-11-19T13:40").toISOString() } });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).ignoredCheckins).toBe(0);
    await app.close();
  });

  it("skips users who haven't been active for a month", async () => {
    await makeUser({ lastActiveAt: at("2026-09-01T10:00") });
    expect(await runTick({ prisma, model, push }, at("2026-11-19T07:00"))).toBe(0);
  });
  it("asks for the status of a passed reminder with a template, once, and pushes it", async () => {
    const user = await makeUser({ lastUserMessageAt: at("2026-11-19T09:00"), checkinIntervalH: "off" });
    await prisma.device.create({ data: { userId: user.id, platform: "android", pushToken: "ExponentPushToken[abc]" } });
    const item = await prisma.item.create({ data: { userId: user.id, type: "reminder", title: "call mum", remindAt: at("2026-11-19T12:00"), dueAt: at("2026-11-19T12:00") } });

    expect(await runTick({ prisma, model, push }, at("2026-11-19T13:00"))).toBe(1);
    const msg = await prisma.message.findFirstOrThrow({ where: { userId: user.id, kind: "followup" } });
    expect(msg.text).toBe("عملت «call mum»؟ 🙂");
    expect(msg.clientId).toBe(`status:item:${item.id}:${at("2026-11-19T13:00").toISOString()}`);
    expect(prompts).toHaveLength(0); // no AI call
    expect(pushed.at(-1)![0]).toMatchObject({ body: "عملت «call mum»؟ 🙂", data: { kind: "followup" } });

    // Not again for the same item, even hours later.
    expect(await runTick({ prisma, model, push }, at("2026-11-19T17:00"))).toBe(0);
  });
});
