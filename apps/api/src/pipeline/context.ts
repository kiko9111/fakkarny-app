import type { Item, Memory, Message, PrismaClient, Summary, User } from "../generated/prisma/client";
import { describeNow, describeUpcomingDays, toLocalIso } from "../lib/time";
import { helplineFor } from "../persona/prompt";
import { detectScriptInContext, type Script } from "./rules";

export const RECENT_MESSAGES = 15;
export const MAX_MEMORIES = 20;
export const MAX_OPEN_ITEMS = 40;

export interface ConversationContext {
  user: User;
  now: Date;
  memories: Memory[];
  openItems: Item[];
  summary: Summary | null;
  /** Oldest first; the last one is the message being answered. */
  recent: Message[];
}

/**
 * Pick the ~20 most relevant memories: ones whose subject appears in the recent chat first,
 * then the most recently used/created.
 */
export function rankMemories(memories: Memory[], recentText: string, limit = MAX_MEMORIES): Memory[] {
  const text = recentText.toLowerCase();
  const score = (m: Memory) => (text.includes(m.subject.toLowerCase()) ? 1 : 0);
  const recency = (m: Memory) => (m.lastUsedAt ?? m.createdAt).getTime();
  return [...memories].sort((a, b) => score(b) - score(a) || recency(b) - recency(a)).slice(0, limit);
}

export async function loadContext(prisma: PrismaClient, user: User, now: Date): Promise<ConversationContext> {
  const [recentDesc, memories, openItems, summary] = await Promise.all([
    prisma.message.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: RECENT_MESSAGES }),
    prisma.memory.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.item.findMany({
      where: { userId: user.id, status: "open" },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: MAX_OPEN_ITEMS,
    }),
    prisma.summary.findFirst({ where: { userId: user.id }, orderBy: { periodEnd: "desc" } }),
  ]);
  const recent = recentDesc.reverse();
  return {
    user,
    now,
    memories: rankMemories(memories, recent.map((m) => m.text).join("\n")),
    openItems,
    summary,
    recent,
  };
}

const local = (d: Date | null, tz: string) => (d ? toLocalIso(d, tz) : null);

function describeItem(i: Item, tz: string): string {
  const bits = [`id=${i.id}`, i.type, JSON.stringify(i.title)];
  if (i.dueAt) bits.push(`due ${local(i.dueAt, tz)}`);
  if (i.remindAt) bits.push(`remind ${local(i.remindAt, tz)}`);
  if (i.repeatEveryMinutes) bits.push(`repeats every ${i.repeatEveryMinutes} min`);
  if (i.important) bits.push("important");
  if (i.type === "debt" && i.debtPerson) {
    bits.push(`${i.debtDirection === "i_owe" ? "user owes" : "owes user"}: ${i.debtPerson} ${i.debtAmount?.toString() ?? "?"}`);
  }
  return `- ${bits.join(" | ")}`;
}

/**
 * The language of the reply, decided in code from the message being answered (left to
 * itself the model drifts). Null when the message has no letters (emoji, a bare
 * number): then the model follows the conversation.
 */
export function replyScript(userTexts: string[], fallback: Script = "english"): string | null {
  const last = userTexts.at(-1) ?? "";
  if (!/[a-z\u0600-\u06FF]/i.test(last)) return null;
  switch (detectScriptInContext(userTexts, fallback)) {
    case "arabic":
      return "Egyptian Arabic in Arabic letters (their last message is in Arabic script)";
    case "franco":
      return "Egyptian Arabic in ARABIC letters (they write Franco: read it as Arabic, never answer in Latin letters). Titles, nudges and names in Arabic letters too";
    default:
      return "English (their last message is in English). If it is actually Arabic typed in Latin letters, answer in Egyptian Arabic in Arabic letters instead";
  }
}

/** True when the reply to the latest message has to contain Arabic letters (Arabic or Franco conversation). */
export function mustReplyInArabic(userTexts: string[], fallback: Script = "english"): boolean {
  const last = userTexts.at(-1) ?? "";
  return /[a-z\u0600-\u06FF]/i.test(last) && detectScriptInContext(userTexts, fallback) !== "english";
}

/** The user's own messages in the recent chat, oldest first. */
export function userTexts(recent: Pick<Message, "role" | "text">[]): string[] {
  return recent.filter((m) => m.role === "user").map((m) => m.text);
}

/**
 * Arabic needs a grammatical gender for "you". Decided in code so it stays stable from
 * one reply to the next: feminine once a memory records it, otherwise masculine.
 */
export function addressAs(memories: Pick<Memory, "content">[]): string {
  return memories.some((m) => m.content.includes("المؤنث"))
    ? "a woman (feminine forms: إنتي، قوليلي، عاملة إيه)"
    : "a man (masculine forms, the default: إنت، قولي، عامل إيه) unless their own words in this conversation are feminine";
}

/**
 * The per-user context block, sent as the first user turn (after the cached persona).
 * Kept deterministic for a given state so repeated calls can share cache where possible.
 */
export function renderContext(ctx: ConversationContext): string {
  const { user, now } = ctx;
  const tz = user.timezone;
  const lines: string[] = [];
  lines.push(`NOW: ${describeNow(now, tz)}`);
  lines.push(`UPCOMING DAYS: ${describeUpcomingDays(now, tz)}`);
  lines.push(`USER: name=${user.name ?? "(unknown — ask what to call them if it fits)"}; app language (fallback only; REPLY SCRIPT decides)=${user.language === "ar_EG" ? "Egyptian Arabic" : "English"}; tone=${user.tone}; wakes ${user.wakeTime}, sleeps ${user.sleepTime}`);
  const script = replyScript(userTexts(ctx.recent), user.language === "en" ? "english" : "arabic");
  if (script) lines.push(`REPLY SCRIPT: ${script}`);
  lines.push(`ADDRESS THE USER AS: ${addressAs(ctx.memories)}`);
  lines.push(`HELPLINE (only for distress): ${helplineFor(tz)}`);
  lines.push("");
  lines.push("MEMORIES (what you know about their life):");
  lines.push(ctx.memories.length ? ctx.memories.map((m) => `- [${m.kind}] ${m.subject}: ${m.content}`).join("\n") : "- (nothing yet)");
  lines.push("");
  lines.push("OPEN ITEMS (use these ids in update_items):");
  lines.push(ctx.openItems.length ? ctx.openItems.map((i) => describeItem(i, tz)).join("\n") : "- (none)");
  if (ctx.summary) {
    lines.push("");
    lines.push(`EARLIER CONVERSATION (summary up to ${local(ctx.summary.periodEnd, tz)}):`);
    lines.push(ctx.summary.text);
  }
  return lines.join("\n");
}
