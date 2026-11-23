import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { CircleResponse, CircleSummary, CreateInviteResponse, ListCirclesResponse, MeResponse, TaskResponse } from "@fakkarni/shared";
import { buildApp } from "../app";
import { hasTestDb, resetDb, testPrisma } from "../../test/db";

const SECRET = "test-secret-at-least-32-characters-long!!";
const token = (sub: string) =>
  new SignJWT({ role: "authenticated" }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setAudience("authenticated").setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

describe.skipIf(!hasTestDb)("circle trial and extras", () => {
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
      billing: { requireSubscription: true },
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
    const res = await app.inject({ method: "PATCH", url: "/me", headers: h, payload: { name } });
    return Object.defineProperty({ ...h }, "id", { value: MeResponse.parse(res.json()).user.id, enumerable: false }) as unknown as H & { id: string };
  };
  const post = (h: H, url: string, payload?: object) => app.inject({ method: "POST", url, headers: h, ...(payload ? { payload } : {}) });
  const gymWith = async (owner: H, other: H) => {
    const circle = CircleResponse.parse((await post(owner, "/circles", { kind: "friends", name: "الجيم" })).json()).circle;
    const { invite } = CreateInviteResponse.parse((await post(owner, `/circles/${circle.id}/invites`)).json());
    await post(other, `/invites/${invite.code}/accept`);
    return circle;
  };

  it("gives a custom circle 14 days of extras, then locks the summary without Pro", async () => {
    const mona = await signedIn("منى");
    const ahmed = await signedIn("أحمد");
    const circle = await gymWith(mona, ahmed);
    expect(circle).toMatchObject({ name: "الجيم", extras: true, trial_until: "2026-12-06T10:00:00.000Z" });

    const task = TaskResponse.parse((await post(mona, `/circles/${circle.id}/tasks`, { assignee_id: ahmed.id, title: "تمرين رجل" })).json()).task;
    await post(ahmed, `/tasks/${task.id}/respond`, { answer: "accept" });
    await post(ahmed, `/tasks/${task.id}/done`);
    const summary = CircleSummary.parse((await app.inject({ method: "GET", url: `/circles/${circle.id}/summary`, headers: mona })).json());
    expect(summary.lines.join(" ")).toContain("1 مهمة");

    clock = new Date("2026-12-07T10:00:00Z");
    expect(ListCirclesResponse.parse((await app.inject({ method: "GET", url: "/circles", headers: mona })).json()).circles[0]!.extras).toBe(false);
    expect((await app.inject({ method: "GET", url: `/circles/${circle.id}/summary`, headers: mona })).statusCode).toBe(402);

    // Pro brings the extras back.
    await prisma.user.update({ where: { id: mona.id }, data: { bonusProUntil: new Date("2027-01-01T00:00:00Z") } });
    expect((await app.inject({ method: "GET", url: `/circles/${circle.id}/summary`, headers: mona })).statusCode).toBe(200);
  });

  it("keeps the first nudge per task free after the trial; more need Pro", async () => {
    const mona = await signedIn("منى");
    const ahmed = await signedIn("أحمد");
    const circle = await gymWith(mona, ahmed);
    clock = new Date("2026-12-10T10:00:00Z");
    const task = TaskResponse.parse((await post(mona, `/circles/${circle.id}/tasks`, { assignee_id: ahmed.id, title: "تمرين رجل" })).json()).task;
    await post(ahmed, `/tasks/${task.id}/respond`, { answer: "accept" });
    clock = new Date("2026-12-11T10:00:00Z");
    expect((await post(mona, `/tasks/${task.id}/nudge`)).statusCode).toBe(200);
    clock = new Date("2026-12-12T10:00:00Z");
    expect((await post(mona, `/tasks/${task.id}/nudge`)).statusCode).toBe(402);
  });
});
