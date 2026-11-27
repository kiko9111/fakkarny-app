import type { BriefTopic } from "@fakkarni/shared";
import { FEEDS, type Feed } from "./feeds";
import { parseFeed, plainText, type Headline } from "./rss";

/**
 * The latest headlines for a topic. Two sources:
 * - Default: the publishers' RSS feeds in feeds.ts. Free, no key.
 * - GNEWS_API_KEY set: GNews (gnews.io), a news API licensed for commercial apps (Essential plan,
 *   €49.99 a month, 1,000 requests a day; the free plan is non-commercial only). One request per
 *   topic and language per edition, so at most 12 × 2 × 4 = 96 a day whatever the number of users.
 *   Falls back to the feeds when GNews fails.
 */
export type NewsLang = "arabic" | "english";

export interface NewsDeps {
  fetchImpl?: typeof fetch;
  gnewsKey?: string;
  now: Date;
}

/** Headlines older than this are not news any more. */
export const MAX_AGE_H = 30;
/** How many headlines the model reads for one topic. */
export const MAX_HEADLINES = 12;
const FEED_TIMEOUT_MS = 8_000;
const MAX_FEED_BYTES = 2_000_000;
const UA = "ZakiDailyBrief/1.0 (+news summary with links to the source)";

async function getText(fetchImpl: typeof fetch, url: string): Promise<string> {
  const res = await fetchImpl(url, { headers: { "user-agent": UA, accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" }, signal: AbortSignal.timeout(FEED_TIMEOUT_MS), redirect: "follow" });
  if (!res.ok) throw new Error(`http_${res.status}`);
  const text = await res.text();
  return text.length > MAX_FEED_BYTES ? text.slice(0, MAX_FEED_BYTES) : text;
}

export async function readFeed(fetchImpl: typeof fetch, feed: Feed): Promise<Headline[]> {
  return parseFeed(await getText(fetchImpl, feed.url), feed.source);
}

const titleKey = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().slice(0, 80);

/**
 * Recent, without repeats (the same story from two feeds), newest first, taking from each source
 * in turn so one busy feed can't fill the list (pure).
 */
export function pickHeadlines(all: Headline[], now: Date, max = MAX_HEADLINES): Headline[] {
  const since = now.getTime() - MAX_AGE_H * 3600_000;
  const seen = new Set<string>();
  const bySource = new Map<string, Headline[]>();
  for (const h of [...all].sort((a, b) => b.at.getTime() - a.at.getTime())) {
    // A time in the future (a feed's clock or time zone is off) still counts, up to an hour ahead.
    if (h.at.getTime() < since || h.at.getTime() > now.getTime() + 3600_000) continue;
    const key = titleKey(h.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const list = bySource.get(h.source) ?? [];
    list.push(h);
    bySource.set(h.source, list);
  }
  const lists = [...bySource.values()];
  const out: Headline[] = [];
  for (let i = 0; out.length < max && lists.some((l) => l.length > i); i++) {
    for (const l of lists) if (l[i] && out.length < max) out.push(l[i]!);
  }
  return out;
}

const GNEWS: Record<BriefTopic, { category?: string; q?: Record<NewsLang, string> }> = {
  egypt: { category: "nation" },
  world: { category: "world" },
  football: { q: { arabic: "كرة القدم", english: "football" } },
  sports: { category: "sports" },
  ai: { q: { arabic: "الذكاء الاصطناعي", english: '"artificial intelligence"' } },
  tech: { category: "technology" },
  cars: { q: { arabic: "سيارات", english: "cars" } },
  business: { category: "business" },
  science: { category: "science" },
  health: { category: "health" },
  entertainment: { category: "entertainment" },
  gaming: { q: { arabic: "ألعاب الفيديو", english: '"video games"' } },
};

export function gnewsUrl(topic: BriefTopic, lang: NewsLang, key: string): string {
  const spec = GNEWS[topic];
  const p = new URLSearchParams({ lang: lang === "arabic" ? "ar" : "en", max: "10", apikey: key });
  if (topic === "egypt" || lang === "arabic") p.set("country", "eg");
  if (spec.q) {
    p.set("q", spec.q[lang]);
    return `https://gnews.io/api/v4/search?${p}`;
  }
  p.set("category", spec.category!);
  return `https://gnews.io/api/v4/top-headlines?${p}`;
}

export function parseGnews(json: unknown): Headline[] {
  const articles = (json as { articles?: unknown })?.articles;
  if (!Array.isArray(articles)) return [];
  const out: Headline[] = [];
  for (const a of articles as Record<string, unknown>[]) {
    const title = typeof a.title === "string" ? plainText(a.title, 200) : "";
    const at = typeof a.publishedAt === "string" ? new Date(a.publishedAt) : null;
    if (!title || !at || Number.isNaN(at.getTime())) continue;
    const src = (a.source as { name?: unknown } | undefined)?.name;
    const url = typeof a.url === "string" && /^https?:\/\//.test(a.url) ? a.url : null;
    out.push({ title, link: url, at, summary: typeof a.description === "string" ? plainText(a.description, 240) : "", source: typeof src === "string" ? plainText(src, 60) : "GNews" });
  }
  return out;
}

/** The headlines Zaki summarises for `topic` (an empty list when every source failed or had nothing new). */
export async function fetchHeadlines(topic: BriefTopic, lang: NewsLang, deps: NewsDeps): Promise<Headline[]> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  if (deps.gnewsKey) {
    try {
      const picked = pickHeadlines(parseGnews(JSON.parse(await getText(fetchImpl, gnewsUrl(topic, lang, deps.gnewsKey)))), deps.now);
      if (picked.length) return picked;
    } catch {
      // The feeds below still answer.
    }
  }
  const results = await Promise.allSettled(FEEDS[topic].map((f) => readFeed(fetchImpl, f)));
  return pickHeadlines(results.flatMap((r) => (r.status === "fulfilled" ? r.value : [])), deps.now);
}
