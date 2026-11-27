/**
 * Lists which news feeds answer, how many headlines each had in the last 30 hours, and the
 * headlines one topic's brief would be written from. `npm run brief:feeds -w @fakkarni/api`.
 * The cloud session can't reach the feeds: .github/workflows/brief-feeds.yml runs this on GitHub.
 * Exits 1 when a topic has no working feed.
 */
import { BRIEF_TOPICS } from "@fakkarni/shared";
import { FEEDS } from "./feeds";
import { MAX_AGE_H, pickHeadlines, readFeed } from "./news";
import { headlineLines } from "./rules";

const now = new Date();
let dead = 0;
for (const topic of BRIEF_TOPICS) {
  const results = await Promise.all(
    FEEDS[topic].map(async (f) => {
      try {
        const items = await readFeed(fetch, f);
        const fresh = items.filter((h) => now.getTime() - h.at.getTime() < MAX_AGE_H * 3600_000).length;
        console.log(`  ${fresh > 0 ? "ok  " : "QUIET"} ${String(items.length).padStart(3)} items, ${String(fresh).padStart(3)} fresh  ${f.source}  ${f.url}`);
        return items;
      } catch (err) {
        console.log(`  FAIL  ${(err as Error).message.slice(0, 60)}  ${f.source}  ${f.url}`);
        return [];
      }
    }),
  );
  const picked = pickHeadlines(results.flat(), now);
  if (!picked.length) dead++;
  console.log(`${topic}: ${picked.length} headlines to write from`);
  for (const line of headlineLines(picked, "arabic")) console.log(`    ar: ${line}`);
  for (const line of headlineLines(picked, "english")) console.log(`    en: ${line}`);
}
if (dead) {
  console.log(`${dead} topic(s) with no working feed`);
  process.exit(1);
}
