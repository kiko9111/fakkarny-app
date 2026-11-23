import type { ReplyLang } from "../pipeline/rules";

/**
 * Memory moments (owner decision, 2026-11-23): about once a week, late afternoon, Zaki brings back
 * something the user told him weeks ago, to show the memory is real and turn old talk into a next
 * step ("a month ago you wanted to start walking: shall I track it?"). Pure rules here; the words
 * come from one short AI call, with no template fallback (a template can't judge what is kind to
 * bring back). Sensitive memories are never picked, and the model can still decline.
 */
export const MOMENT_EVERY_DAYS = 7;
export const MOMENT_FROM_HOUR = 16;
export const MOMENT_UNTIL_HOUR = 19;
export const MIN_AGE_DAYS = 14;
export const MAX_AGE_DAYS = 120;
export const QUIET_AFTER_USER_MIN = 30;

/** Never brought back unprompted: illness, loss, break-ups, mental health. Arabic, Franco, English. */
const SENSITIVE = /(مرض|مريض|سرطان|ورم|مات|ماتت|توف|وفا|عزا|طلاق|طلق|انفصل|اكتئاب|انتحار|اجهاض|إجهاض|cancer|tumou?r|died|death|passed away|funeral|grief|divorc|break ?up|broke up|depress|suicid|miscarr|illness|sick|tale2|ektea2b)/i;

export interface MomentMemory {
  id: string;
  kind: string;
  subject: string;
  content: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export const isSensitive = (m: Pick<MomentMemory, "subject" | "content">) => SENSITIVE.test(`${m.subject} ${m.content}`);

/** The local hour is in the window. */
export function isMomentTime(localIso: string): boolean {
  const hour = Number(localIso.slice(11, 13));
  return hour >= MOMENT_FROM_HOUR && hour < MOMENT_UNTIL_HOUR;
}

/** The memory to bring back: old enough, not used lately, not sensitive; the longest unused first. */
export function pickMemory(memories: MomentMemory[], now: Date): MomentMemory | null {
  const day = 86_400_000;
  const ok = memories.filter((m) => {
    const age = (now.getTime() - m.createdAt.getTime()) / day;
    if (age < MIN_AGE_DAYS || age > MAX_AGE_DAYS) return false;
    if (m.lastUsedAt && now.getTime() - m.lastUsedAt.getTime() < MIN_AGE_DAYS * day) return false;
    return m.kind !== "place" && !isSensitive(m);
  });
  ok.sort((a, b) => (a.lastUsedAt ?? a.createdAt).getTime() - (b.lastUsedAt ?? b.createdAt).getTime());
  return ok[0] ?? null;
}

export const momentClientId = (memoryId: string, now: Date) => `memory:${memoryId}:${now.toISOString()}`;

export const MOMENT_SYSTEM = `You are Zaki (زكي), the user's warm, positive, short-spoken Egyptian AI friend. Weeks ago they told you the fact below. Bring it back in 1 or 2 very short chat messages (one sentence each, separated by a newline): show you remember, ask ONE friendly question about it, and if it fits, offer one useful next step you can do (remind them, track a habit, note a date).
Rules: never invent anything beyond the fact; no guilt, no pressure, never "I miss you"; never a list; no greeting like "hi". Write in the requested language and script exactly.
If bringing this up could hurt or embarrass them (health, loss, money trouble, family conflict, anything private), or it is too trivial to be worth a message, output exactly SKIP.
Output only the message text.`;

const LANG: Record<ReplyLang, string> = {
  arabic: "Egyptian Arabic (everyday Cairo dialect, never Modern Standard) in Arabic script",
  english: "English",
};

export function momentPrompt(m: MomentMemory, now: Date, opts: { name: string | null; script: ReplyLang }): string {
  const weeks = Math.max(2, Math.round((now.getTime() - m.createdAt.getTime()) / (7 * 86_400_000)));
  return [`Language: ${LANG[opts.script]}.`, `Their name: ${opts.name ?? "unknown (don't use a name)"}.`, `Told you about ${weeks} weeks ago:`, `- ${m.subject}: ${m.content}`].join("\n");
}

/** The model's answer as chat lines, or null for SKIP or anything off-shape. */
export function momentLines(text: string): string[] | null {
  const t = text.trim();
  if (!t || /^skip\b/i.test(t)) return null;
  const lines = t.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 2);
  if (!lines.length || lines.some((l) => l.length > 280 || /^\s*([-•*]|\d+[.)])\s/.test(l) || /\bSKIP\b/.test(l))) return null;
  return lines;
}
