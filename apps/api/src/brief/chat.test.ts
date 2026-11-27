import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { INSTALL_ID_HEADER, PostMessageResponse } from "@fakkarni/shared";
import { buildApp } from "../app";
import type { FriendModel } from "../ai/model";
import { createConversationPipeline } from "../pipeline/conversation";
import { hasTestDb, resetDb, testPrisma } from "../../test/db";
import { readBriefAsk } from "./chat";

describe("reading a brief ask", () => {
  it("hears a daily news ask with topics and a time, in Arabic, Franco and English", () => {
    expect(readBriefAsk("ابعتلي أخبار الكورة والعربيات كل يوم الساعة 8 الصبح")).toEqual({ kind: "on", topics: ["football", "cars"], time: "08:00" });
    expect(readBriefAsk("akhbar el 3arabeyat kol yom")).toEqual({ kind: "on", topics: ["cars"], time: null });
    expect(readBriefAsk("send me AI news every morning at 9pm")).toEqual({ kind: "on", topics: ["ai"], time: "21:00" });
    expect(readBriefAsk("عايز نشرة يومية")).toEqual({ kind: "on", topics: [], time: null });
  });
  it("hears stop, for all topics or one", () => {
    expect(readBriefAsk("وقف الأخبار")).toEqual({ kind: "off", topics: [] });
    expect(readBriefAsk("stop the football news")).toEqual({ kind: "off", topics: ["football"] });
  });
  it("leaves one-off news talk and questions to the model", () => {
    expect(readBriefAsk("عايز أعرف أخبار الكورة")).toBeNull();
    expect(readBriefAsk("شفت الأخبار؟")).toBeNull();
    expect(readBriefAsk("any news every day?")).toBeNull();
    expect(readBriefAsk("فكرني كل يوم أشرب مية")).toBeNull();
  });
});

describe.skipIf(!hasTestDb)("daily news from the chat", () => {
  const prisma = testPrisma();
  const usage = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const model: FriendModel = { respond: async () => { throw new Error("no AI call expected"); }, complete: async () => ({ text: "", usage }) };
  const make = (requireSubscription: boolean) =>
    buildApp({ logger: false }, { prisma, rateLimitPerMinute: false, auth: { allowInstallId: true }, pipeline: createConversationPipeline({ model }), billing: { requireSubscription } });
  const open = make(false);
  const free = make(true);
  beforeEach(() => resetDb(prisma));
  afterAll(async () => {
    await open.close();
    await free.close();
    await prisma.$disconnect();
  });
  const say = async (app: typeof open, id: string, text: string) => {
    const res = await app.inject({ method: "POST", url: "/messages", headers: { [INSTALL_ID_HEADER]: id, "x-message-kinds": "2" }, payload: { client_id: randomUUID(), text, created_at: new Date().toISOString(), timezone: "Africa/Cairo" } });
    expect(res.statusCode).toBe(201);
    return PostMessageResponse.parse(res.json());
  };

  it("turns the brief on, adds topics, and stops it, with an Open card to Daily news", async () => {
    const id = randomUUID();
    const on = await say(open, id, "ابعتلي أخبار الكورة كل يوم الساعة 9");
    expect(on.replies[0]!.text).toBe("تمام! كل يوم الساعة 09:00 هبعتلك آخر أخبار الكورة.");
    expect(on.replies[0]!.actions?.[0]).toMatchObject({ kind: "open_screen", route: "/me/news" });
    await say(open, id, "and AI news daily too");
    expect(await prisma.user.findFirstOrThrow()).toMatchObject({ briefTopics: ["football", "ai"], briefTime: "09:00" });
    const off = await say(open, id, "وقف أخبار الكورة");
    expect(off.replies[0]!.text).toContain("الذكاء الاصطناعي");
    expect((await prisma.user.findFirstOrThrow()).briefTopics).toEqual(["ai"]);
  });

  it("keeps a free user to one topic and says what Pro adds", async () => {
    const id = randomUUID();
    await say(free, id, "daily football news");
    const two = await say(free, id, "send me cars news every day");
    expect(two.replies[0]!.text).toContain("Free has one topic");
    expect((await prisma.user.findFirstOrThrow()).briefTopics).toEqual(["cars"]);
  });
});
