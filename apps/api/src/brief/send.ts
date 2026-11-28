import { knownTopics, type BriefTopic } from "@fakkarni/shared";
import type { PrismaClient, User } from "../generated/prisma/client";
import { costUsd, FRIEND_MODEL, type FriendModel, type Usage } from "../ai/model";
import { localToUtc, toLocalIso } from "../lib/time";
import { fetchHeadlines, type NewsDeps, type NewsLang } from "./news";
import { BRIEF_SYSTEM, briefClientId, briefPrompt, composeBrief, digestLines, editionOf, headlineLines, isBriefTime, sourceNames, type TopicDigest } from "./rules";

/**
 * The daily news brief: one topic's news is read and summarised once per language and edition
 * (6 hours) for everyone who follows it, and stored in brief_digests; each user's brief is put
 * together from those with no AI call of its own. So the cost grows with topics, not users
 * (at most 12 topics × 2 languages × 4 editions = 96 short calls a day), and a brief never uses
 * the user's daily AI allowance.
 */
export interface BriefDeps {
  prisma: PrismaClient;
  model?: FriendModel;
  news: Omit<NewsDeps, "now">;
}

/** A topic whose sources all failed is tried again after this long, not on every user's tick. */
const RETRY_AFTER_MS = 15 * 60_000;
const failedAt = new Map<string, number>();
/** Two users due in the same tick wait for one read of the news, not two. */
const building = new Map<string, Promise<TopicDigest | null>>();

/** For tests: forget the in-process memory of failed and running reads. */
export function resetBriefMemory() {
  failedAt.clear();
  building.clear();
}

async function buildDigest(deps: BriefDeps, topic: BriefTopic, lang: NewsLang, edition: string, now: Date, payerId: string): Promise<TopicDigest | null> {
  const key = `${topic}:${lang}:${edition}`;
  const failed = failedAt.get(key);
  if (failed && now.getTime() - failed < RETRY_AFTER_MS) return null;
  const headlines = await fetchHeadlines(topic, lang, { ...deps.news, now });
  if (!headlines.length) {
    failedAt.set(key, now.getTime());
    return null;
  }
  let lines = headlineLines(headlines, lang);
  let usage: Usage | null = null;
  if (deps.model) {
    try {
      const out = await deps.model.complete({ system: BRIEF_SYSTEM, prompt: briefPrompt(topic, lang, headlines), maxTokens: 500 });
      usage = out.usage;
      lines = digestLines(out.text, lang);
    } catch {
      // The headlines themselves are still news; the next edition tries the model again.
    }
  }
  const digest: TopicDigest = { topic, lines, sources: lines.length ? sourceNames(headlines) : [] };
  await deps.prisma.briefDigest.createMany({ data: [{ topic, lang, edition, lines: digest.lines, sources: digest.sources, createdAt: now }], skipDuplicates: true });
  // The events table is per user: the shared call is counted on the user whose brief needed it.
  if (usage) await deps.prisma.event.create({ data: { userId: payerId, name: "ai_call", propsJson: { purpose: "brief_digest", topic, model: FRIEND_MODEL, ...usage, cost_usd: costUsd(usage) } } });
  failedAt.delete(key);
  return digest;
}

/** This edition's digest for a topic: stored, being read by another user's tick, or read now. */
export async function digestFor(deps: BriefDeps, topic: BriefTopic, lang: NewsLang, now: Date, payerId: string): Promise<TopicDigest | null> {
  const edition = editionOf(now);
  const row = await deps.prisma.briefDigest.findUnique({ where: { topic_lang_edition: { topic, lang, edition } } });
  if (row) return { topic, lines: Array.isArray(row.lines) ? (row.lines as unknown[]).filter((l): l is string => typeof l === "string") : [], sources: row.sources };
  const key = `${topic}:${lang}:${edition}`;
  let job = building.get(key);
  if (!job) {
    job = buildDigest(deps, topic, lang, edition, now, payerId).finally(() => building.delete(key));
    building.set(key, job);
  }
  return job;
}

export interface BriefResult {
  /** The bubbles stored in the chat (empty when nothing was sent). */
  texts: string[];
}

/**
 * Sends today's brief if the user follows topics, it is their brief time, and today's has not
 * gone out. A day whose topics all had no news is marked as done (event brief_daily, sent false)
 * once every topic was read, so the tick doesn't keep trying. Returns the bubbles stored.
 */
export async function sendDailyBrief(deps: BriefDeps, user: User, langOf: () => Promise<NewsLang>, now: Date): Promise<BriefResult | null> {
  const topics = knownTopics(user.briefTopics ?? []);
  if (!topics.length || !user.briefTime) return null;
  const local = toLocalIso(now, user.timezone);
  if (!isBriefTime(local, user.briefTime)) return null;
  const day = local.slice(0, 10);
  const midnight = localToUtc(`${day}T00:00`, user.timezone);
  const [sent, tried] = await Promise.all([
    deps.prisma.message.findFirst({ where: { userId: user.id, clientId: briefClientId(day, 0) }, select: { id: true } }),
    deps.prisma.event.findFirst({ where: { userId: user.id, name: "brief_daily", createdAt: { gte: midnight } }, select: { id: true } }),
  ]);
  if (sent || tried) return null;

  const lang = await langOf();
  const digests = await Promise.all(topics.map((t) => digestFor(deps, t, lang, now, user.id)));
  const read = digests.filter((d): d is TopicDigest => d !== null);
  const texts = composeBrief(lang, { name: user.name, localHour: Number(local.slice(11, 13)), digests: read });
  if (!texts.length) {
    // Every topic was read and had nothing: done for today. A topic that failed is tried again.
    if (read.length === topics.length) await deps.prisma.event.create({ data: { userId: user.id, name: "brief_daily", propsJson: { sent: false, topics: topics.length } } });
    return null;
  }
  const { count } = await deps.prisma.message.createMany({
    data: texts.map((text, n) => ({ userId: user.id, role: "friend" as const, kind: "checkin" as const, text, clientId: briefClientId(day, n), createdAt: new Date(now.getTime() + n) })),
    skipDuplicates: true,
  });
  if (!count) return null;
  await deps.prisma.event.create({ data: { userId: user.id, name: "brief_daily", propsJson: { sent: true, topics: topics.length, with_news: texts.length - 1 } } });
  return { texts };
}
