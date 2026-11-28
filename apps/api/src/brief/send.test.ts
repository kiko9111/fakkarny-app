import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { INSTALL_ID_HEADER } from "@fakkarni/shared";
import { buildApp } from "../app";
import type { FriendModel } from "../ai/model";
import { localToUtc } from "../lib/time";
import { hasTestDb, resetDb, testPrisma } from "../../test/db";
import type { PushMessage, PushSender } from "../proactive/push";
import { runTick } from "../proactive/tick";
import { nextTickAt } from "../proactive/schedule";
import { resetBriefMemory } from "./send";

const usage = { input_tokens: 400, output_tokens: 60, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const at = (local: string) => localToUtc(local, "Africa/Cairo");

const rss = (titles: string[], when: Date) =>
  `<rss><channel>${titles.map((t, i) => `<item><title>${t}</title><link>https://news.example/${i}</link><pubDate>${new Date(when.getTime() - i * 3600_000).toUTCString()}</pubDate></item>`).join("")}</channel></rss>`;

describe("brief schedule", () => {
  it("wakes the tick for the brief time while asleep or with the budget spent", () => {
    const user = { timezone: "Africa/Cairo", wakeTime: "07:00", sleepTime: "23:00", briefTime: "06:30", briefTopics: ["ai"] };
    expect(nextTickAt(user, at("2026-11-27T02:00"))).toEqual(at("2026-11-27T06:30"));
    expect(nextTickAt({ ...user, briefTopics: [] }, at("2026-11-27T02:00"))).toEqual(at("2026-11-27T07:00"));
    expect(nextTickAt({ ...user, briefTime: "20:00" }, at("2026-11-27T12:00"), { budgetSpent: true })).toEqual(at("2026-11-27T20:00"));
  });
});

describe.skipIf(!hasTestDb)("daily news brief", () => {
  const prisma = testPrisma();
  const pushed: PushMessage[][] = [];
  const push: PushSender = async (msgs) => (pushed.push(msgs), { sent: msgs.length, invalidTokens: [] });
  const prompts: string[] = [];
  let modelText = "الأهلي كسب الزمالك 2-1\nالدوري متوقف أسبوع";
  const model: FriendModel = {
    respond: async () => ({ ok: false, reason: "invalid_output", usage }),
    complete: async ({ prompt }) => (prompts.push(prompt), { text: modelText, usage }),
  };
  const fetched: string[] = [];
  let feedsUp = true;
  const fetchImpl = (async (url: string) => {
    fetched.push(String(url));
    if (!feedsUp) return new Response("down", { status: 503 });
    return new Response(rss(["Ahly beat Zamalek 2-1", "League paused for a week"], at("2026-11-27T07:00")), { status: 200 });
  }) as unknown as typeof fetch;
  const deps = { prisma, model, push, news: { fetchImpl } };

  beforeEach(async () => {
    pushed.length = 0;
    prompts.length = 0;
    fetched.length = 0;
    feedsUp = true;
    modelText = "الأهلي كسب الزمالك 2-1\nالدوري متوقف أسبوع";
    resetBriefMemory();
    await resetDb(prisma);
  });
  afterAll(() => prisma.$disconnect());

  // Asleep until 10:00 by their settings, so Zaki's own messages stay out of the way: the brief they asked for still goes.
  const quiet = { wakeTime: "10:00", sleepTime: "23:00" };
  const makeUser = (over: Record<string, unknown> = {}) =>
    prisma.user.create({ data: { authId: `install:${randomUUID()}`, timezone: "Africa/Cairo", lastActiveAt: at("2026-11-26T20:00"), briefTopics: ["football"], briefTime: "08:00", ...quiet, ...over } });

  it("sends the brief at the user's time, once a day, pushed, outside Zaki's daily budget", async () => {
    const user = await makeUser({ name: "Kareem" });
    await prisma.device.create({ data: { userId: user.id, platform: "android", pushToken: "ExponentPushToken[a]" } });

    expect(await runTick(deps, at("2026-11-27T07:50"))).toBe(0);
    expect(await prisma.message.count({ where: { clientId: { startsWith: "brief:" } } })).toBe(0);

    expect(await runTick(deps, at("2026-11-27T08:05"))).toBe(1);
    const msgs = await prisma.message.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
    expect(msgs.map((m) => m.clientId)).toEqual(["brief:2026-11-27:0", "brief:2026-11-27:1"]);
    expect(msgs[0]!.text).toBe("صباح الفل يا Kareem! ☀️ دي أهم الأخبار اللي بتحبها:");
    expect(msgs[1]!.text).toContain("⚽ الكورة\n• الأهلي كسب الزمالك 2-1\n• الدوري متوقف أسبوع");
    expect(msgs[1]!.text).toContain("المصدر: مصراوي");
    expect(prompts[0]).toContain("Ahly beat Zamalek 2-1");
    expect(pushed[0]![0]!.body).toBe(`${msgs[0]!.text}\n⚽ الكورة`);
    const cost = await prisma.event.findFirstOrThrow({ where: { name: "ai_call" } });
    expect(cost.propsJson).toMatchObject({ purpose: "brief_digest", topic: "football" });

    // Once a day.
    expect(await runTick(deps, at("2026-11-27T08:20"))).toBe(0);
    expect(await prisma.message.count({ where: { userId: user.id, clientId: { startsWith: "brief:" } } })).toBe(2);
  });

  it("reads one topic once for everyone in the same language", async () => {
    await Promise.all([makeUser(), makeUser(), makeUser()]);
    expect(await runTick(deps, at("2026-11-27T08:01"))).toBe(3);
    expect(prompts).toHaveLength(1);
    expect(await prisma.briefDigest.count()).toBe(1);
  });

  it("writes an English brief for someone who writes English", async () => {
    const user = await makeUser({ briefTopics: ["ai"] });
    await prisma.message.create({ data: { userId: user.id, role: "user", text: "remind me to call mom", clientId: "c1", createdAt: at("2026-11-26T20:00") } });
    modelText = "A new open model came out\nA chip maker raised prices";
    await runTick(deps, at("2026-11-27T08:01"));
    const msgs = await prisma.message.findMany({ where: { userId: user.id, role: "friend" }, orderBy: { createdAt: "asc" } });
    expect(msgs[0]!.text).toBe("Good morning! ☀️ Here's your news:");
    expect(msgs[1]!.text).toContain("🤖 AI\n• A new open model came out");
    expect(prompts[0]).toContain("Write in: English");
  });

  it("sends nothing when every source is down, and tries again later", async () => {
    await makeUser();
    feedsUp = false;
    expect(await runTick(deps, at("2026-11-27T08:01"))).toBe(0);
    feedsUp = true;
    resetBriefMemory();
    await prisma.user.updateMany({ data: { nextTickAt: null } });
    expect(await runTick(deps, at("2026-11-27T08:21"))).toBe(1);
  });

  it("marks the day done when the model finds no real news", async () => {
    const user = await makeUser();
    modelText = "NONE";
    await runTick(deps, at("2026-11-27T08:01"));
    expect(await prisma.message.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.event.findFirst({ where: { userId: user.id, name: "brief_daily" } })).toMatchObject({ propsJson: { sent: false } });
  });

  it("sends no brief without topics, or when the server has no news source", async () => {
    await makeUser({ briefTopics: [] });
    await makeUser();
    expect(await runTick({ prisma, model, push }, at("2026-11-27T08:01"))).toBe(0);
    expect(fetched).toHaveLength(0);
  });
});

describe.skipIf(!hasTestDb)("brief settings", () => {
  const prisma = testPrisma();
  const free = buildApp({ logger: false }, { prisma, auth: { allowInstallId: true }, billing: { requireSubscription: true } });
  const open = buildApp({ logger: false }, { prisma, auth: { allowInstallId: true } });
  beforeEach(() => resetDb(prisma));
  afterAll(async () => {
    await free.close();
    await open.close();
    await prisma.$disconnect();
  });
  const patch = (app: typeof free, id: string, body: unknown) => app.inject({ method: "PATCH", url: "/me", headers: { [INSTALL_ID_HEADER]: id }, payload: body as Record<string, unknown> });

  it("saves topics in a fixed order, gives a default time, and clears the tick", async () => {
    const id = randomUUID();
    const res = await patch(open, id, { brief_topics: ["ai", "football"] });
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({ brief_topics: ["football", "ai"], brief_time: "08:00" });
    const off = await patch(open, id, { brief_topics: [] });
    expect(off.json().user).toMatchObject({ brief_topics: [], brief_time: "08:00" });
    expect((await patch(open, id, { brief_topics: ["nope"] })).statusCode).toBe(400);
    expect((await patch(open, id, { brief_time: "25:00" })).statusCode).toBe(400);
  });

  it("keeps free users to one topic while subscriptions are on", async () => {
    const id = randomUUID();
    expect((await patch(free, id, { brief_topics: ["ai"] })).statusCode).toBe(200);
    const two = await patch(free, id, { brief_topics: ["ai", "cars"] });
    expect(two.statusCode).toBe(402);
    expect(two.json()).toEqual({ error: "brief_limit" });
    await prisma.user.updateMany({ data: { bonusProUntil: new Date(Date.now() + 86400_000) } });
    expect((await patch(free, id, { brief_topics: ["ai", "cars", "tech", "world", "egypt"] })).statusCode).toBe(200);
    expect((await patch(free, id, { brief_topics: ["ai", "cars", "tech", "world", "egypt", "gaming"] })).statusCode).toBe(400);
  });
});
