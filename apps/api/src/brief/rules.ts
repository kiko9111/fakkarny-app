import { BRIEF_TOPIC_NAMES, type BriefTopic } from "@fakkarni/shared";
import { z } from "zod";
import type { Headline } from "./rss";
import type { NewsLang } from "./news";

/**
 * The daily news brief's rules and words (pure). The brief goes out once a local day, from the
 * user's chosen time until BRIEF_WINDOW_MIN later (the tick looks every 10 minutes while the user
 * is awake and wakes up for the brief time otherwise: proactive/schedule.ts).
 */
export const BRIEF_WINDOW_MIN = 90;

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** The local clock (an ISO string from toLocalIso) is inside the brief's window. */
export function isBriefTime(localIso: string, briefTime: string): boolean {
  const since = (minutesOf(localIso.slice(11, 16)) - minutesOf(briefTime) + 1440) % 1440;
  return since < BRIEF_WINDOW_MIN;
}

export const briefClientId = (localDay: string, n: number) => `brief:${localDay}:${n}`;

/** News is read again at most every 6 hours: the UTC day and 6-hour block ("2026-11-27T06"). */
export function editionOf(now: Date): string {
  const iso = now.toISOString();
  const block = Math.floor(now.getUTCHours() / 6) * 6;
  return `${iso.slice(0, 10)}T${String(block).padStart(2, "0")}`;
}

const LANG: Record<NewsLang, string> = {
  arabic: "Egyptian Arabic (everyday Cairo dialect, never Modern Standard) in Arabic script; keep names of people, teams, companies and products as they are usually written in Egyptian news",
  english: "English",
};

export const BRIEF_SYSTEM = `You write one topic's part of the daily news brief from Zaki (زكي), a warm, positive Egyptian AI friend. The user asked for this brief.
Read the headlines (from the last day; they may be in Arabic or English) and pick the 2 or 3 most important or most interesting stories. Write one line per story: one short sentence (at most about 25 words) saying what happened.
Rules:
- Only facts that are in the headlines. Never add names, numbers, results, dates, causes or guesses.
- No opinions about politics or religion, never take sides, no predictions.
- Deaths, wars, crimes and disasters: say it plainly and briefly, no graphic detail, no emoji, no jokes.
- Skip gossip, rumours, adverts, opinion columns, horoscopes, quizzes and repeats of the same story.
- When two stories matter equally, prefer the one that matters to someone living in Egypt.
- Start each line with the news itself: no number, no bullet, no "Headline:", no greeting.
If none of the headlines is real news about this topic, output exactly NONE.
Output only the lines, one per line, in the requested language.`;

export function briefPrompt(topic: BriefTopic, lang: NewsLang, headlines: Headline[]): string {
  const rows = headlines.map((h, i) => `${i + 1}. ${h.title}${h.summary ? ` — ${h.summary}` : ""} (${h.source})`);
  return [`Topic: ${BRIEF_TOPIC_NAMES[topic].en}.`, `Write in: ${LANG[lang]}.`, "Headlines:", ...rows].join("\n");
}

const ARABIC = /[؀-ۿ]/;
export const MAX_LINES = 3;
const MAX_LINE = 300;

/** What the model may put in a brief: at most three short lines (validated like every AI output). */
const DigestLines = z.array(z.string().min(1).max(MAX_LINE)).max(MAX_LINES);

/** The model's answer as brief lines ([] for NONE or nothing usable). */
export function digestLines(text: string, lang: NewsLang): string[] {
  const t = text.trim();
  if (!t || /^none\b/i.test(t)) return [];
  const lines = t
    .split("\n")
    .map((l) => l.replace(/^\s*([-•*–]|\d+[.)-])\s*/, "").trim())
    .filter((l) => l && l.length <= MAX_LINE && !/^none$/i.test(l) && (lang === "english" || ARABIC.test(l)))
    .slice(0, MAX_LINES);
  const ok = DigestLines.safeParse(lines);
  return ok.success ? ok.data : [];
}

/** Without a model: the newest headlines as they are, in the reader's script when there are enough. */
export function headlineLines(headlines: Headline[], lang: NewsLang): string[] {
  const own = headlines.filter((h) => (lang === "arabic" ? ARABIC.test(h.title) : !ARABIC.test(h.title)));
  return (own.length ? own : lang === "english" ? [] : headlines).slice(0, MAX_LINES).map((h) => h.title);
}

/** The sources the lines came from, at most three names. */
export function sourceNames(headlines: Headline[]): string[] {
  return [...new Set(headlines.map((h) => h.source))].slice(0, 3);
}

export interface TopicDigest {
  topic: BriefTopic;
  lines: string[];
  sources: string[];
}

/**
 * The chat bubbles of one brief: a greeting, then one bubble per topic with news (title, lines,
 * sources). No "ask me for more": Zaki knows only these lines, and would make the rest up. [] when
 * no topic had news.
 */
export function composeBrief(lang: NewsLang, opts: { name: string | null; localHour: number; digests: TopicDigest[] }): string[] {
  const ar = lang === "arabic";
  const withNews = opts.digests.filter((d) => d.lines.length);
  if (!withNews.length) return [];
  const first = opts.name?.trim().split(/\s+/)[0] ?? "";
  const morning = opts.localHour >= 4 && opts.localHour < 12;
  const hello = ar
    ? `${morning ? "صباح الفل" : "مساء الفل"}${first ? ` يا ${first}` : ""}! ${morning ? "☀️ " : ""}دي أهم الأخبار اللي بتحبها:`
    : `${morning ? "Good morning" : "Hi"}${first ? `, ${first}` : ""}! ${morning ? "☀️ " : ""}Here's your news:`;
  const bubbles = withNews.map((d) => {
    const name = BRIEF_TOPIC_NAMES[d.topic];
    const head = `${name.emoji} ${ar ? name.ar : name.en}`;
    const src = d.sources.length ? `${ar ? "المصدر" : "Sources"}: ${d.sources.join(ar ? "، " : ", ")}` : "";
    return [head, ...d.lines.map((l) => `• ${l}`), src].filter(Boolean).join("\n");
  });
  return [hello, ...bubbles];
}
