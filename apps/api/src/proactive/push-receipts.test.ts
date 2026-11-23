import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hasTestDb, resetDb, testPrisma } from "../../test/db";
import { createExpoPushSender, createExpoReceiptChecker, type PushSender } from "./push";
import { checkPushReceipts, RECEIPT_AFTER_MS, trackPush } from "./push-receipts";

describe("Expo push client", () => {
  it("returns ticket ids and tokens rejected at once", async () => {
    const fake = (async () =>
      new Response(JSON.stringify({ data: [{ status: "ok", id: "t1" }, { status: "error", details: { error: "DeviceNotRegistered" } }] }))) as unknown as typeof fetch;
    const result = await createExpoPushSender(fake)([{ to: "A", body: "x" }, { to: "B", body: "y" }]);
    expect(result).toEqual({ sent: 1, invalidTokens: ["B"], tickets: [{ id: "t1", token: "A" }] });
  });

  it("reads receipts and returns the ids of uninstalled apps", async () => {
    let body = "";
    const fake = (async (_url: string, init: RequestInit) => {
      body = String(init.body);
      return new Response(JSON.stringify({ data: { t1: { status: "ok" }, t2: { status: "error", details: { error: "DeviceNotRegistered" } }, t3: { status: "error", details: { error: "MessageRateExceeded" } } } }));
    }) as unknown as typeof fetch;
    expect(await createExpoReceiptChecker(fake)(["t1", "t2", "t3"])).toEqual(["t2"]);
    expect(JSON.parse(body)).toEqual({ ids: ["t1", "t2", "t3"] });
  });
});

describe.skipIf(!hasTestDb)("push receipts", () => {
  const prisma = testPrisma();
  beforeEach(() => resetDb(prisma));
  afterAll(() => prisma.$disconnect());

  async function device(token: string) {
    const user = await prisma.user.create({ data: { authId: `install:${randomUUID()}` } });
    return prisma.device.create({ data: { userId: user.id, platform: "android", pushToken: token } });
  }

  it("clears tokens rejected at send time and keeps tickets for later", async () => {
    await device("ExponentPushToken[ok]");
    await device("ExponentPushToken[dead]");
    const send: PushSender = async () => ({ sent: 1, invalidTokens: ["ExponentPushToken[dead]"], tickets: [{ id: "t1", token: "ExponentPushToken[ok]" }] });
    await trackPush(prisma, send)([{ to: "ExponentPushToken[ok]", body: "x" }, { to: "ExponentPushToken[dead]", body: "x" }]);
    expect(await prisma.device.count({ where: { pushToken: null } })).toBe(1);
    expect(await prisma.pushTicket.findMany({ select: { id: true, token: true } })).toEqual([{ id: "t1", token: "ExponentPushToken[ok]" }]);
  });

  it("clears tokens whose receipt says the app is gone, once receipts are ready", async () => {
    await device("ExponentPushToken[a]");
    await device("ExponentPushToken[b]");
    const sentAt = new Date("2026-11-23T10:00:00Z");
    await prisma.pushTicket.createMany({ data: [{ id: "t1", token: "ExponentPushToken[a]", createdAt: sentAt }, { id: "t2", token: "ExponentPushToken[b]", createdAt: sentAt }] });
    const asked: string[][] = [];
    const check = async (ids: string[]) => (asked.push(ids), ["t2"]);

    expect(await checkPushReceipts(prisma, check, new Date(sentAt.getTime() + 60_000))).toBe(0);
    expect(asked).toHaveLength(0); // too early

    expect(await checkPushReceipts(prisma, check, new Date(sentAt.getTime() + RECEIPT_AFTER_MS))).toBe(1);
    expect((await prisma.device.findMany({ where: { pushToken: null } })).length).toBe(1);
    expect(await prisma.device.count({ where: { pushToken: "ExponentPushToken[a]" } })).toBe(1);
    expect(await prisma.pushTicket.count()).toBe(0);
  });
});
