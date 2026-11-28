import { z } from "zod";

/**
 * Daily news brief (2026-11-27, owner ask: "the user chooses topics and Zaki gives a short brief of
 * what happened latest, every day"). Opt-in: the user picks topics and a time; Zaki sends one short
 * brief a day in the chat (plus a push). The news is read and summarised once per topic and
 * language for everyone (apps/api/src/brief), so a brief costs no AI call per user and never uses
 * the user's daily AI allowance. Free keeps FREE_BRIEF_TOPICS topics; Pro up to MAX_BRIEF_TOPICS.
 */
export const BRIEF_TOPICS = ["egypt", "world", "football", "sports", "ai", "tech", "cars", "business", "science", "health", "entertainment", "gaming"] as const;
export const BriefTopic = z.enum(BRIEF_TOPICS);
export type BriefTopic = z.infer<typeof BriefTopic>;

export const FREE_BRIEF_TOPICS = 1;
export const MAX_BRIEF_TOPICS = 5;
/** The time offered first when the user turns the brief on. */
export const DEFAULT_BRIEF_TIME = "08:00";

/** Names in the chat brief and on the topic chips (no emoji on chips: the phone strips them). */
export const BRIEF_TOPIC_NAMES: Record<BriefTopic, { ar: string; en: string; emoji: string }> = {
  egypt: { ar: "مصر", en: "Egypt", emoji: "🇪🇬" },
  world: { ar: "العالم", en: "World", emoji: "🌍" },
  football: { ar: "الكورة", en: "Football", emoji: "⚽" },
  sports: { ar: "الرياضة", en: "Sports", emoji: "🏅" },
  ai: { ar: "الذكاء الاصطناعي", en: "AI", emoji: "🤖" },
  tech: { ar: "التكنولوجيا", en: "Tech", emoji: "📱" },
  cars: { ar: "العربيات", en: "Cars", emoji: "🚗" },
  business: { ar: "الاقتصاد والفلوس", en: "Business", emoji: "📈" },
  science: { ar: "العلوم", en: "Science", emoji: "🔬" },
  health: { ar: "الصحة", en: "Health", emoji: "🩺" },
  entertainment: { ar: "أفلام ومسلسلات", en: "Movies and TV", emoji: "🎬" },
  gaming: { ar: "الألعاب", en: "Gaming", emoji: "🎮" },
};

/** Topics a phone or server knows, in the order of BRIEF_TOPICS, without repeats (old data may hold names a newer build dropped). */
export function knownTopics(list: readonly string[]): BriefTopic[] {
  const set = new Set(list);
  return BRIEF_TOPICS.filter((t) => set.has(t));
}

/** How many topics this user may follow. `limits` is false while the server runs without subscriptions. */
export function briefTopicLimit(pro: boolean, limits = true): number {
  return pro || !limits ? MAX_BRIEF_TOPICS : FREE_BRIEF_TOPICS;
}
