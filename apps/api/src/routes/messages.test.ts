import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { INSTALL_ID_HEADER, ListMessagesResponse, PostMessageResponse } from "@fakkarni/shared";
import { buildApp } from "../app";
import { backgroundSettled } from "../lib/background";
import { hasTestDb, resetDb, testPrisma } from "../../test/db";

describe.skipIf(!hasTestDb)("messages routes", () => {
  const prisma = testPrisma();
  const fixedNow = new Date("2026-11-19T10:00:00.000Z");
  const app = buildApp({ logger: false }, { prisma, now: () => fixedNow });
  const installId = randomUUID();
  const headers = { [INSTALL_ID_HEADER]: installId };

  beforeEach(() => resetDb(prisma));
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const post = (body: object, h: Record<string, string> = headers) =>
    app.inject({ method: "POST", url: "/messages", headers: h, payload: body });

  it("rejects requests without a valid install id", async () => {
    const res = await post({ client_id: "c1", text: "hi", created_at: fixedNow.toISOString() }, {});
    expect(res.statusCode).toBe(401);
    const bad = await post({ client_id: "c1", text: "hi", created_at: fixedNow.toISOString() }, { [INSTALL_ID_HEADER]: "nope" });
    expect(bad.statusCode).toBe(401);
  });

  it("stores a message, creating the user on first contact", async () => {
    const res = await post({ client_id: "c1", text: "Remind me to pay Omar's school bus on the 1st", created_at: "2026-11-19T09:00:00.000Z", timezone: "Africa/Cairo" });
    expect(res.statusCode).toBe(201);
    const body = PostMessageResponse.parse(res.json());
    expect(body.duplicate).toBe(false);
    expect(body.message).toMatchObject({ role: "user", kind: "chat", client_id: "c1", created_at: "2026-11-19T09:00:00.000Z" });
    const user = await prisma.user.findUniqueOrThrow({ where: { authId: `install:${installId}` } });
    expect(user.timezone).toBe("Africa/Cairo");
  });

  it("is idempotent on client_id (offline retries never duplicate)", async () => {
    const body = { client_id: "c-retry", text: "Dentist Sunday at 6", created_at: fixedNow.toISOString() };
    const first = await post(body);
    const second = await post(body);
    expect(first.statusCode).toBe(201);
    // The no-op pipeline stores no reply, so the retry is answered again (as after a restart
    // mid-reply); either way the user's message is never stored twice.
    expect([200, 201]).toContain(second.statusCode);
    expect(PostMessageResponse.parse(second.json()).message.id).toBe(PostMessageResponse.parse(first.json()).message.id);
    expect(await prisma.message.count()).toBe(1);
  });

  it("keeps client_ids separate per user", async () => {
    const body = { client_id: "same", text: "hello", created_at: fixedNow.toISOString() };
    await post(body);
    const other = await post(body, { [INSTALL_ID_HEADER]: randomUUID() });
    expect(other.statusCode).toBe(201);
    expect(await prisma.message.count()).toBe(2);
  });

  it("clamps future timestamps to now and ignores invalid time zones", async () => {
    const res = await post({ client_id: "c-future", text: "hi", created_at: "2030-01-01T00:00:00.000Z", timezone: "Not/AZone" });
    expect(PostMessageResponse.parse(res.json()).message.created_at).toBe(fixedNow.toISOString());
    const user = await prisma.user.findUniqueOrThrow({ where: { authId: `install:${installId}` } });
    expect(user.timezone).toBe("Africa/Cairo");
  });

  it("validates the body", async () => {
    expect((await post({ client_id: "c", text: "   ", created_at: fixedNow.toISOString() })).statusCode).toBe(400);
    expect((await post({ text: "hi" })).statusCode).toBe(400);
  });

  it("lists messages after a timestamp, oldest first", async () => {
    await post({ client_id: "a", text: "one", created_at: "2026-11-19T08:00:00.000Z" });
    await post({ client_id: "b", text: "two", created_at: "2026-11-19T09:00:00.000Z" });
    const all = ListMessagesResponse.parse((await app.inject({ method: "GET", url: "/messages", headers })).json());
    expect(all.messages.map((m) => m.text)).toEqual(["one", "two"]);
    const after = ListMessagesResponse.parse(
      (await app.inject({ method: "GET", url: "/messages?after=2026-11-19T08:30:00.000Z", headers })).json(),
    );
    expect(after.messages.map((m) => m.text)).toEqual(["two"]);
  });

  it("never shows one user's messages to another", async () => {
    await post({ client_id: "a", text: "private", created_at: fixedNow.toISOString() });
    const res = await app.inject({ method: "GET", url: "/messages", headers: { [INSTALL_ID_HEADER]: randomUUID() } });
    expect(ListMessagesResponse.parse(res.json()).messages).toEqual([]);
  });
});

describe.skipIf(!hasTestDb)("a retry while the reply is being written", () => {
  const prisma = testPrisma();
  const fixedNow = new Date("2026-11-19T10:00:00.000Z");
  // A slow friend: the phone gives up and sends again before the reply is stored.
  const app = buildApp(
    { logger: false },
    {
      prisma,
      now: () => fixedNow,
      pipeline: async ({ prisma: db, user, message, timing }) => {
        await new Promise((r) => setTimeout(r, 300));
        if (timing) timing.model = 300;
        const reply = await db.message.create({ data: { userId: user.id, role: "friend", kind: "chat", text: "أهلاً", clientId: `${message.clientId}:reply:0`, createdAt: new Date(message.createdAt.getTime() + 1) } });
        return { replies: [reply], items: [], memories: [] };
      },
    },
  );
  const headers = { [INSTALL_ID_HEADER]: randomUUID() };
  beforeEach(() => resetDb(prisma));
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("waits for that same reply instead of answering 409, and reports where the time went", async () => {
    const body = { client_id: "slow-1", text: "alo", created_at: fixedNow.toISOString() };
    const first = app.inject({ method: "POST", url: "/messages", headers, payload: body });
    await new Promise((r) => setTimeout(r, 100));
    const second = await app.inject({ method: "POST", url: "/messages", headers, payload: body });
    const firstRes = await first;
    expect(firstRes.statusCode).toBe(201);
    expect(String(firstRes.headers["server-timing"])).toMatch(/model;dur=300, total;dur=\d+/);
    expect(second.statusCode).toBe(201);
    const a = PostMessageResponse.parse(firstRes.json());
    const b = PostMessageResponse.parse(second.json());
    expect(b.replies.map((m) => m.id)).toEqual(a.replies.map((m) => m.id));
    expect(await prisma.message.count({ where: { role: "friend" } })).toBe(1);
  });

  it("is waited for by the server's stop, which also covers a turn whose phone has gone", async () => {
    const answered = app.inject({ method: "POST", url: "/messages", headers, payload: { client_id: "slow-2", text: "alo", created_at: fixedNow.toISOString() } });
    await new Promise((r) => setTimeout(r, 100)); // the reply is being written
    const before = Date.now();
    await backgroundSettled(5_000);
    expect(Date.now() - before).toBeGreaterThanOrEqual(150);
    expect(await prisma.message.count({ where: { role: "friend" } })).toBe(1); // stored before the stop went on
    expect((await answered).statusCode).toBe(201);
  });
});
