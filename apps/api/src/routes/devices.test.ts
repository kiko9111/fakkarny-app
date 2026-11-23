import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { INSTALL_ID_HEADER } from "@fakkarni/shared";
import { buildApp } from "../app";
import { hasTestDb, resetDb, testPrisma } from "../../test/db";

describe.skipIf(!hasTestDb)("devices", () => {
  const prisma = testPrisma();
  const app = buildApp({ logger: false }, { prisma });
  beforeEach(() => resetDb(prisma));
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const as = (install: string) => ({ [INSTALL_ID_HEADER]: install });

  it("registers a token, moves it to whoever registers it next, and removes it on sign-out", async () => {
    const a = randomUUID();
    const b = randomUUID();
    const token = "ExponentPushToken[phone]";
    expect((await app.inject({ method: "POST", url: "/devices", headers: as(a), payload: { platform: "android", push_token: token } })).statusCode).toBe(204);
    expect((await app.inject({ method: "POST", url: "/devices", headers: as(a), payload: { platform: "android", push_token: token } })).statusCode).toBe(204);
    expect(await prisma.device.count()).toBe(1);

    await app.inject({ method: "POST", url: "/devices", headers: as(b), payload: { platform: "android", push_token: token } });
    const device = await prisma.device.findFirstOrThrow({ include: { user: true } });
    expect(device.user.authId).toBe(`install:${b}`);

    // Someone else can't remove it.
    await app.inject({ method: "DELETE", url: "/devices", headers: as(a), payload: { push_token: token } });
    expect(await prisma.device.count()).toBe(1);
    expect((await app.inject({ method: "DELETE", url: "/devices", headers: as(b), payload: { push_token: token } })).statusCode).toBe(204);
    expect(await prisma.device.count()).toBe(0);
  });
});
