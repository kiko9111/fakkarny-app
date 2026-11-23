import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../app";
import { hasTestDb, testPrisma } from "../../test/db";

describe.skipIf(!hasTestDb)("share card routes", () => {
  const prisma = testPrisma();
  const app = buildApp({ logger: false }, { prisma, rateLimitPerMinute: false, auth: { allowInstallId: true } });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });
  it("renders a streak card as PNG and refuses silly numbers", async () => {
    const res = await app.inject({ method: "GET", url: "/cards/streak/7.png?lang=ar&code=abc1234" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.rawPayload.subarray(1, 4).toString()).toBe("PNG");
    expect((await app.inject({ method: "GET", url: "/cards/streak/1.png" })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/cards/streak/abc.png" })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/s/NOPE1234/card.png" })).statusCode).toBe(404);
  });
});
