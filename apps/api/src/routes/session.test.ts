import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ExportResponse, ListItemsResponse, ListMessagesResponse, MeResponse, SessionMessage, SessionResponse, SessionState } from "@fakkarni/shared";
import { z } from "zod";
import type { ChatTurn, FriendModel, SessionTurn } from "../ai/model";
import { buildApp } from "../app";
import { hasTestDb, resetDb, testPrisma } from "../../test/db";

const SECRET = "test-secret-at-least-32-characters-long!!";
const token = (sub: string) =>
  new SignJWT({ role: "authenticated" }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setAudience("authenticated").setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));
const usage = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const TurnResponse = z.object({ messages: z.array(SessionMessage), ended: z.boolean() });

describe.skipIf(!hasTestDb)("Session", () => {
  const prisma = testPrisma();
  let clock = new Date("2026-11-22T18:00:00Z");
  /** Scripted model: answers from the queue and records what it was sent. */
  let queue: (SessionTurn | "fail")[] = [];
  const calls: { system: string; context: string; history: ChatTurn[] }[] = [];
  const model: FriendModel = {
    respond: async () => ({ ok: false, reason: "invalid_output", usage }),
    complete: async () => ({ text: "", usage }),
    reflect: async (input) => {
      calls.push(input);
      const next = queue.shift();
      if (!next || next === "fail") throw new Error("boom");
      return { ok: true, output: next, usage };
    },
  };
  const app = buildApp({ logger: false }, { prisma, now: () => clock, rateLimitPerMinute: false, auth: { supabaseJwtSecret: SECRET, allowInstallId: true }, model, sessionEnabled: true });
  beforeEach(async () => {
    await resetDb(prisma);
    clock = new Date("2026-11-22T18:00:00Z");
    queue = [];
    calls.length = 0;
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  type P = { h: Record<string, string>; id: string };
  const signedIn = async (extra: object = {}): Promise<P> => {
    const h = { authorization: `Bearer ${await token(randomUUID())}` };
    const res = await app.inject({ method: "PATCH", url: "/me", headers: h, payload: { name: "منى", ...extra } });
    return { h, id: MeResponse.parse(res.json()).user.id };
  };
  const post = (p: P, url: string, payload?: object) => app.inject({ method: "POST", url, headers: p.h, ...(payload ? { payload } : {}) });
  const state = async (p: P) => SessionState.parse((await app.inject({ method: "GET", url: "/session", headers: p.h })).json());
  const consent = (p: P) => post(p, "/session/consent", { adult: true, agree: true });
  const start = async (p: P, payload: object = { mode: "talk", mood: 2 }) => SessionResponse.parse((await post(p, "/session/start", payload)).json()).session;
  const say = async (p: P, id: string, text: string) => TurnResponse.parse((await post(p, `/session/${id}/messages`, { text })).json());

  it("needs its own consent and an adult before anything starts", async () => {
    const mona = await signedIn();
    expect(await state(mona)).toMatchObject({ available: true, allowed: true, consented: false, free_left: 1, open: null, moods: [] });
    expect((await state(mona)).helpline).toMatch(/\d{3,}/);
    expect((await post(mona, "/session/start", { mode: "talk", mood: 3 })).json()).toEqual({ error: "consent_required" });
    // Both boxes have to be ticked.
    expect((await post(mona, "/session/consent", { adult: true })).statusCode).toBe(400);
    expect((await post(mona, "/session/consent", { adult: false, agree: true })).statusCode).toBe(400);
    expect((await consent(mona)).statusCode).toBe(204);
    expect((await state(mona)).consented).toBe(true);

    // Someone marked as a teen in a family circle is kept out, even with consent on file.
    const circle = await post(mona, "/circles", { kind: "family", name: "البيت" });
    const circleId = (circle.json() as { circle: { id: string } }).circle.id;
    await app.inject({ method: "PATCH", url: `/circles/${circleId}/members/${mona.id}`, headers: mona.h, payload: { family_role: "teen" } });
    expect((await state(mona)).allowed).toBe(false);
    expect((await post(mona, "/session/start", { mode: "talk", mood: 3 })).json()).toEqual({ error: "adults_only" });
    expect((await consent(mona)).statusCode).toBe(403);
  });

  it("opens with 'not a doctor', listens, and keeps everything out of the main chat", async () => {
    const mona = await signedIn();
    await consent(mona);
    const session = await start(mona);
    expect(session.messages.map((m) => m.role)).toEqual(["zaki", "zaki"]);
    expect(session.messages[0]!.text).toContain("مش دكتور");
    expect(calls).toHaveLength(0); // the opening costs no AI call

    queue = [{ reply: ["واضح إن اليوم كان تقيل عليك.", "إيه أكتر حاجة ضايقتك؟"], crisis: false, step: null }];
    const turn = await say(mona, session.id, "يومي كان وحش في الشغل");
    expect(turn.messages.map((m) => [m.role, m.text])).toEqual([["user", "يومي كان وحش في الشغل"], ["zaki", "واضح إن اليوم كان تقيل عليك."], ["zaki", "إيه أكتر حاجة ضايقتك؟"]]);
    expect(turn.ended).toBe(false);

    // The model gets the Session prompt and a small context: mode, mood, helpline. No tasks, debts or memories.
    expect(calls[0]!.system).toContain("# SAFETY (never weaken these rules)");
    expect(calls[0]!.context).toContain("Mode: talk");
    expect(calls[0]!.context).toContain("Helpline to give in a crisis:");
    expect(calls[0]!.context).not.toMatch(/item|debt|memor/i);
    expect(calls[0]!.history.at(-1)).toEqual({ role: "user", text: "يومي كان وحش في الشغل" });

    // Nothing lands in the main chat, and analytics carry no content.
    expect(ListMessagesResponse.parse((await app.inject({ method: "GET", url: "/messages", headers: mona.h })).json()).messages).toEqual([]);
    const events = await prisma.event.findMany({ where: { userId: mona.id } });
    expect(JSON.stringify(events)).not.toContain("الشغل");
    expect(events.map((e) => e.name)).toEqual(expect.arrayContaining(["session_consent", "session_started", "ai_call"]));

    // It is in the user's own export, and the open session is restored on the next visit.
    const exp = ExportResponse.parse((await app.inject({ method: "GET", url: "/me/export", headers: mona.h })).json());
    expect(exp.sessions[0]!.messages).toHaveLength(5);
    expect((await state(mona)).open!.messages).toHaveLength(5);
    expect((await state(mona)).moods).toEqual([{ at: "2026-11-22T18:00:00.000Z", mood: 2 }]);
  });

  it("always answers a crisis with care and the helpline number, even if the model fails or misses it", async () => {
    const mona = await signedIn();
    await consent(mona);
    const session = await start(mona);
    const digits = (await state(mona)).helpline.match(/\d{3,}/)![0];

    // The model misses it (crisis false, offers a step): the keyword net still adds the helpline and drops the step.
    queue = [{ reply: ["أنا سامعك."], crisis: false, step: { title: "اتمشى شوية", remind_at_local: null } }];
    const missed = await say(mona, session.id, "أنا عايز اموت");
    expect(missed.messages.some((m) => m.role === "zaki" && m.text.includes(digits))).toBe(true);
    expect(missed.messages.every((m) => m.step === null)).toBe(true);

    // The model is down: a fixed care line plus the helpline.
    queue = ["fail"];
    const down = await say(mona, session.id, "I want to end my life");
    expect(down.messages.filter((m) => m.role === "zaki")).toHaveLength(2);
    expect(down.messages.at(-1)!.text).toContain(digits);

    // The model flags it without a keyword: helpline added too.
    queue = [{ reply: ["I'm really glad you told me."], crisis: true, step: null }];
    const flagged = await say(mona, session.id, "everything feels pointless lately");
    expect(flagged.messages.at(-1)!.text).toContain(digits);

    const flags = await prisma.event.findMany({ where: { userId: mona.id, name: "crisis_flag" } });
    expect(flags).toHaveLength(3);
    expect(JSON.stringify(flags)).not.toMatch(/اموت|end my life|pointless/);
    expect((await prisma.reflectSession.findUniqueOrThrow({ where: { id: session.id } })).crisis).toBe(true);
  });

  it("turns one suggested step into a reminder only when the user taps it", async () => {
    const mona = await signedIn();
    await consent(mona);
    const session = await start(mona);
    queue = [
      { reply: ["إيه رأيك تكلمي أختك النهارده؟"], crisis: false, step: { title: "أكلم أختي", remind_at_local: "2026-11-22T21:00" } },
      { reply: ["تمام."], crisis: false, step: { title: "حاجة تانية", remind_at_local: null } },
    ];
    const turn = await say(mona, session.id, "حاسة إني لوحدي");
    const withStep = turn.messages.at(-1)!;
    // 21:00 in Cairo is 19:00 UTC.
    expect(withStep.step).toEqual({ title: "أكلم أختي", remind_at: "2026-11-22T19:00:00.000Z", accepted: false });
    const items = async () => ListItemsResponse.parse((await app.inject({ method: "GET", url: "/items", headers: mona.h })).json()).items;
    expect(await items()).toEqual([]);

    expect((await post(mona, `/session/steps/${withStep.id}/remind`)).statusCode).toBe(204);
    expect((await post(mona, `/session/steps/${withStep.id}/remind`)).statusCode).toBe(204); // a second tap adds nothing
    expect(await items()).toMatchObject([{ type: "reminder", title: "أكلم أختي", remind_at: "2026-11-22T19:00:00.000Z" }]);

    // One step per session: a second suggestion is dropped.
    expect((await say(mona, session.id, "ماشي")).messages.at(-1)!.step).toBeNull();
    const other = await signedIn();
    expect((await post(other, `/session/steps/${withStep.id}/remind`)).statusCode).toBe(404);
  });

  it("gives one free session a week, no limit for Pro, and falls back kindly without a usable answer", async () => {
    const mona = await signedIn({ language: "en" });
    await consent(mona);
    const first = await start(mona, { mode: "night", mood: 4 });
    // Starting again while one is open returns the same session.
    expect((await start(mona)).id).toBe(first.id);
    queue = ["fail"];
    expect((await say(mona, first.id, "long day")).messages.at(-1)!.text).toBe("I'm listening, but something went wrong on my side. Could you say that again?");

    const ended = SessionResponse.parse((await post(mona, `/session/${first.id}/end`)).json()).session;
    expect(ended.ended_at).not.toBeNull();
    expect(ended.messages.at(-1)!.text).toContain("Thank you for giving yourself this time");
    expect((await post(mona, `/session/${first.id}/messages`, { text: "hi" })).statusCode).toBe(409);

    const blocked = await post(mona, "/session/start", { mode: "talk", mood: 3 });
    expect(blocked.statusCode).toBe(402);
    expect(blocked.json()).toEqual({ error: "session_limit", next_free_at: "2026-11-29T18:00:00.000Z" });
    expect(await state(mona)).toMatchObject({ free_left: 0, next_free_at: "2026-11-29T18:00:00.000Z" });

    await prisma.user.update({ where: { id: mona.id }, data: { bonusProUntil: new Date("2026-12-10T00:00:00Z") } });
    expect((await state(mona)).free_left).toBeNull();
    expect((await post(mona, "/session/start", { mode: "talk", mood: 3 })).statusCode).toBe(201);
  });

  it("stays closed unless it is switched on", async () => {
    const closed = buildApp({ logger: false }, { prisma, now: () => clock, rateLimitPerMinute: false, auth: { supabaseJwtSecret: SECRET, allowInstallId: true }, model });
    const mona = await signedIn();
    const get = await closed.inject({ method: "GET", url: "/session", headers: mona.h });
    expect(SessionState.parse(get.json()).available).toBe(false);
    for (const [url, payload] of [["/session/consent", { adult: true, agree: true }], ["/session/start", { mode: "talk", mood: 3 }]] as const)
      expect((await closed.inject({ method: "POST", url, headers: mona.h, payload })).json()).toEqual({ error: "session_unavailable" });
    expect((await closed.inject({ method: "DELETE", url: "/session", headers: mona.h })).statusCode).toBe(204);
    await closed.close();
  });

  it("deletes everything in one tap and keeps other people out", async () => {
    const mona = await signedIn();
    await consent(mona);
    const session = await start(mona);
    queue = [{ reply: ["أنا سامعك."], crisis: false, step: null }];
    await say(mona, session.id, "كلام خاص");

    const other = await signedIn();
    await consent(other);
    expect((await post(other, `/session/${session.id}/messages`, { text: "x" })).statusCode).toBe(404);
    expect((await post(other, `/session/${session.id}/end`)).statusCode).toBe(404);

    expect((await app.inject({ method: "DELETE", url: "/session", headers: mona.h })).statusCode).toBe(204);
    expect(await state(mona)).toMatchObject({ consented: false, open: null, moods: [], free_left: 1 });
    expect(await prisma.reflectMessage.count()).toBe(0);
    expect(await prisma.sessionConsent.count({ where: { userId: mona.id } })).toBe(0);
  });
});
