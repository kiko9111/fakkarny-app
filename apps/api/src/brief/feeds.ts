import type { BriefTopic } from "@fakkarni/shared";

/**
 * Where each topic's news comes from: public RSS feeds that the publishers offer for exactly this
 * (headline, short description, link). No key, no cost. Zaki reads the headlines and writes his
 * own two or three lines, naming the sources; nothing is copied whole. Feeds in either language
 * serve both: the model writes the brief in the reader's language.
 *
 * Checked on 2026-11-27 (GitHub run): every topic had fresh headlines; Al Arabiya (403) and
 * VentureBeat (429) refused the runner and were replaced.
 *
 * A feed that fails or goes quiet is skipped (news.ts), so a topic keeps working while any one of
 * its feeds answers. `npm run brief:feeds -w @fakkarni/api` (src/brief/check-feeds.ts) lists which
 * answer; the cloud session can't reach them, so .github/workflows/brief-feeds.yml runs it on
 * GitHub ("[brief-feeds]" in a commit message, or by hand).
 *
 * With GNEWS_API_KEY set, news.ts asks GNews instead (a licensed news API; see brief/news.ts).
 */
export interface Feed {
  /** Shown to the user as the source. */
  source: string;
  url: string;
}

const masrawy = (id: number, slug: string): Feed => ({ source: "مصراوي", url: `https://www.masrawy.com/rss/feed/${id}/${encodeURIComponent(slug)}` });
const bbc = (path: string): Feed => ({ source: "BBC", url: `https://feeds.bbci.co.uk/${path}/rss.xml` });
const guardian = (path: string): Feed => ({ source: "The Guardian", url: `https://www.theguardian.com/${path}/rss` });

export const FEEDS: Record<BriefTopic, Feed[]> = {
  egypt: [masrawy(35, "مصر"), { source: "Egypt Independent", url: "https://www.egyptindependent.com/feed/" }, bbc("arabic/middleeast")],
  world: [bbc("news/world"), bbc("arabic"), masrawy(202, "عرب-وعالم"), guardian("world")],
  football: [masrawy(577, "أخبار-محلية"), masrawy(579, "أخبار-عربية-وعالمية"), bbc("sport/football"), guardian("football")],
  sports: [masrawy(27, "رياضة"), masrawy(578, "رياضات-أخرى"), bbc("sport"), guardian("sport")],
  ai: [
    { source: "TechCrunch", url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
    { source: "The Verge", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml" },
    guardian("technology/artificialintelligenceai"),
    { source: "MIT Technology Review", url: "https://www.technologyreview.com/topic/artificial-intelligence/feed" },
    { source: "البوابة العربية للأخبار التقنية", url: "https://aitnews.com/feed/" },
  ],
  tech: [bbc("news/technology"), masrawy(382, "علوم-وتكنولوجيا"), { source: "The Verge", url: "https://www.theverge.com/rss/index.xml" }, { source: "TechCrunch", url: "https://techcrunch.com/feed/" }],
  cars: [masrawy(375, "أخبار"), { source: "Motor1", url: "https://www.motor1.com/rss/news/all/" }, { source: "Electrek", url: "https://electrek.co/feed/" }],
  business: [masrawy(206, "إقتصاد"), bbc("news/business"), guardian("business")],
  science: [bbc("news/science_and_environment"), { source: "ScienceDaily", url: "https://www.sciencedaily.com/rss/top/science.xml" }, guardian("science")],
  health: [bbc("news/health"), { source: "ScienceDaily", url: "https://www.sciencedaily.com/rss/health_medicine.xml" }],
  entertainment: [masrawy(210, "فنون"), bbc("news/entertainment_and_arts"), { source: "Variety", url: "https://variety.com/feed/" }],
  gaming: [{ source: "Polygon", url: "https://www.polygon.com/rss/index.xml" }, { source: "Eurogamer", url: "https://www.eurogamer.net/feed" }],
};
