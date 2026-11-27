import { BRIEF_TOPICS, knownTopics, MAX_BRIEF_TOPICS, type BriefTopic } from "@fakkarni/shared";

/**
 * The daily news page's choices (pure). Topics keep the order of BRIEF_TOPICS whatever order they
 * were tapped in, so the brief and the Me row read the same way every day.
 */
export type ToggleResult = { topics: BriefTopic[] } | { error: "max" };

export function toggleTopic(current: readonly string[], topic: BriefTopic): ToggleResult {
  const now = knownTopics(current);
  if (now.includes(topic)) return { topics: now.filter((t) => t !== topic) };
  if (now.length >= MAX_BRIEF_TOPICS) return { error: "max" };
  return { topics: knownTopics([...now, topic]) };
}

/** The Me row's value line: "Football, AI · 08:00", or the off word. */
export function newsLine(topics: readonly string[], time: string | null, names: Record<BriefTopic, string>, off: string, comma: string): string {
  const known = knownTopics(topics);
  if (!known.length || !time) return off;
  const shown = known.slice(0, 2).map((t) => names[t]);
  const more = known.length > 2 ? ` +${known.length - 2}` : "";
  return `${shown.join(comma)}${more} · ${time}`;
}

/** The times offered as chips; any other time is typed. */
export const NEWS_TIMES = ["07:00", "08:00", "09:00", "13:00", "20:00"] as const;

export const ALL_TOPICS = BRIEF_TOPICS;
