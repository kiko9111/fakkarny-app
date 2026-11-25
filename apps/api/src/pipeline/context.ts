import type { Item, Memory, Message, PrismaClient, Summary, User } from "../generated/prisma/client";
import { describeNow, describeUpcomingDays, toLocalIso } from "../lib/time";
import { helplineFor } from "../persona/prompt";
import { detectScriptInContext, type Script } from "./rules";
import { loadAppData, loadAppNumbers, type AppData } from "../chat/actions";

export const RECENT_MESSAGES = 15;
export const MAX_MEMORIES = 20;
export const MAX_OPEN_ITEMS = 40;
/** The open items changed most recently, added even past MAX_OPEN_ITEMS. */
export const RECENT_OPEN_ITEMS = 10;

export interface ConversationContext {
  user: User;
  now: Date;
  memories: Memory[];
  openItems: Item[];
  summary: Summary | null;
  /** Oldest first; the last one is the message being answered. */
  recent: Message[];
  /** Circles, money sections and trackers, so the model can name them in app_actions. */
  app?: AppData;
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
  const [recentDesc, memories, byDue, touched, summary, app] = await Promise.all([
    prisma.message.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: RECENT_MESSAGES }),
    prisma.memory.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.item.findMany({
      where: { userId: user.id, status: "open" },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: MAX_OPEN_ITEMS,
    }),
    // What was just made or changed is what the user talks about next ("yes, at 4"): always in
    // the context, even when older open items fill the list.
    prisma.item.findMany({ where: { userId: user.id, status: "open" }, orderBy: { updatedAt: "desc" }, take: RECENT_OPEN_ITEMS }),
    prisma.summary.findFirst({ where: { userId: user.id }, orderBy: { periodEnd: "desc" } }),
    loadAppData(prisma, user.id),
  ]);
  // The numbers ("how much did I spend on food?") need the names first; a failure only loses them.
  app.numbers = await loadAppNumbers(prisma, user, app, now).catch(() => undefined);
  const recent = recentDesc.reverse();
  const seen = new Set(byDue.map((i) => i.id));
  const openItems = [...byDue, ...touched.filter((i) => !seen.has(i.id))];
  return {
    user,
    now,
    memories: rankMemories(memories, recent.map((m) => m.text).join("\n")),
    openItems,
    summary,
    recent,
    app,
  };
}

const money = (n: unknown) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });

/** What the user has in the app, by name, for app_actions. Kept short: names, not ids. */
export function describeApp(app: AppData | undefined, userId: string, tz = "Africa/Cairo"): string[] {
  if (!app) return [];
  const lines: string[] = ["", "IN THE APP (use these names in app_actions; never invent a circle, person, section or tracker):"];
  lines.push(
    `- CIRCLES: ${
      app.circles.length
        ? app.circles
            .map((c) => {
              const others = c.members.filter((m) => m.userId !== userId).map((m) => m.name ?? "(no name)");
              return `«${c.name}» (${c.kind}; with ${others.length ? others.join(", ") : "nobody yet"})`;
            })
            .join(" · ")
        : "none yet"
    }`,
  );
  lines.push(
    `- MONEY SECTIONS: ${
      app.sections.length
        ? app.sections.map((s) => `«${s.name}» (${s.kind}${s.budget !== null ? `, budget ${money(s.budget)}/month` : ""}${s.circle ? `, shared book with «${s.circle.name}»` : ""})`).join(" · ")
        : "none yet"
    }`,
  );
  lines.push(
    `- TRACKERS: ${
      app.trackers.length
        ? app.trackers
            .map((t) => {
              const s = app.numbers?.trackerStats[t.id];
              const stats = s ? `, today ${money(s.today)}, streak ${s.streak} day${s.streak === 1 ? "" : "s"}` : "";
              return `${t.kind === "custom" ? `«${t.name ?? "custom"}»` : t.kind}${t.goal !== null ? ` (goal ${money(t.goal)}/day)` : ""}${t.askTimes.length ? ` asks at ${t.askTimes.join(", ")}` : ""}${t.circle ? `, shared with «${t.circle.name}»` : ""}${stats}`;
            })
            .join(" · ")
        : "none yet"
    }`,
  );
  if (app.numbers) lines.push(...describeNumbers(app, userId, tz));
  return lines;
}

/**
 * The numbers, so questions about the app ("how much on food this month?", "did Omar do his
 * homework?") are answered from facts in the same call. Ids are for the tools' ref field.
 */
export function describeNumbers(app: AppData, userId: string, tz: string): string[] {
  const n = app.numbers;
  if (!n) return [];
  const lines: string[] = [];
  const spent = app.sections.filter((s) => s.kind === "expense").map((s) => {
    const total = n.monthSpend[s.id] ?? 0;
    const pct = s.budget !== null && Number(s.budget) > 0 ? ` of ${money(s.budget)} (${Math.round((total / Number(s.budget)) * 100)}%)` : "";
    return `«${s.name}» ${money(total)}${pct}`;
  });
  const income = app.sections.filter((s) => s.kind === "income").map((s) => `«${s.name}» ${money(n.monthSpend[s.id] ?? 0)}`);
  lines.push(`- MONEY THIS MONTH (EGP): spent ${spent.length ? spent.join(" · ") : "nothing logged"}${income.length ? `; income ${income.join(" · ")}` : ""}`);
  const name = (u: { name: string | null } | null | undefined) => u?.name ?? "(no name)";
  lines.push(
    `- DAFTAR (open debts, from the user's side): ${
      n.daftar.length
        ? n.daftar
            .map((e) => {
              const mine = e.creatorId === userId;
              const who = mine ? e.otherName : name(e.creator);
              const owedToUser = mine ? e.direction === "owed_to_me" : e.direction === "i_owe";
              const state = e.status === "pending" ? (mine ? "waiting for their OK" : "waiting for the user's OK") : e.status;
              return `id=${e.id} ${owedToUser ? `${who} owes the user` : `the user owes ${who}`} ${money(e.amount)}${e.note ? ` (${e.note})` : ""}, ${state}`;
            })
            .join(" · ")
        : "none"
    }`,
  );
  const asked = n.tasks.filter((t) => t.assigneeId === userId && t.status !== "done");
  const byUser = n.tasks.filter((t) => t.assignerId === userId && t.status !== "done");
  const toReview = n.tasks.filter((t) => t.assignerId === userId && t.status === "done");
  const due = (d: Date | null) => (d ? `, due ${toLocalIso(d, tz)}` : "");
  const task = (t: (typeof n.tasks)[number], who: string) => `id=${t.id} «${t.title}»${t.homework ? " (homework)" : ""} ${who}, ${t.status === "pending" ? "not answered yet" : "accepted"}${due(t.dueAt)}`;
  if (n.tasks.length) {
    lines.push(
      `- TASKS: asked of the user: ${asked.length ? asked.map((t) => task(t, `from ${name(t.assigner)}`)).join(" · ") : "none"}; asked by the user: ${byUser.length ? byUser.map((t) => task(t, `for ${name(t.assignee)}`)).join(" · ") : "none"}${
        toReview.length ? `; homework handed in, waiting for the user's review: ${toReview.map((t) => `id=${t.id} «${t.title}» by ${name(t.assignee)}`).join(" · ")}` : ""
      }`,
    );
  } else lines.push("- TASKS: none open");
  if (n.splits.length) {
    lines.push(
      `- SPLITS (last 30 days): ${n.splits
        .map((s) => {
          const people = (s.peopleJson as { name: string; paid?: boolean }[]) ?? [];
          const unpaid = people.slice(1).filter((p) => !p.paid).map((p) => p.name);
          return `id=${s.id} «${s.title || "bill"}» ${money(s.total)} with ${people.length} people, ${unpaid.length ? `not paid yet: ${unpaid.join(", ")}` : "all paid"}`;
        })
        .join(" · ")}`,
    );
  }
  return lines;
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
export function addressAs(memories: Pick<Memory, "content">[], gender?: string | null): string {
  if (gender === "male") return "a man (masculine forms: إنت، قولي، عامل إيه)";
  return gender === "female" || memories.some((m) => m.content.includes("المؤنث"))
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
  lines.push(`ADDRESS THE USER AS: ${addressAs(ctx.memories, user.gender)}`);
  // Arabic needs it for every "you": when nobody knows yet, Zaki asks once, lightly.
  if (!user.gender && !ctx.memories.some((m) => m.content.includes("المؤنث"))) lines.push("GENDER: not set yet. In an Arabic conversation, when it fits naturally (never in distress, and not if you already asked in the recent chat), ask once how to address them (إنت ولا إنتي؟) and save the answer with the app tool: settings, setting address, text female or male.");
  lines.push(`HELPLINE (only for distress): ${helplineFor(tz)}`);
  lines.push("");
  lines.push("MEMORIES (what you know about their life):");
  lines.push(ctx.memories.length ? ctx.memories.map((m) => `- [${m.kind}] ${m.subject}: ${m.content}`).join("\n") : "- (nothing yet)");
  lines.push("");
  lines.push("OPEN ITEMS (use these ids in update_items):");
  lines.push(ctx.openItems.length ? ctx.openItems.map((i) => describeItem(i, tz)).join("\n") : "- (none)");
  lines.push(...describeApp(ctx.app, user.id, tz));
  if (ctx.summary) {
    lines.push("");
    lines.push(`EARLIER CONVERSATION (summary up to ${local(ctx.summary.periodEnd, tz)}):`);
    lines.push(ctx.summary.text);
  }
  return lines.join("\n");
}

/** How much of the chat and the user's data a phone model sees (it reads slowly: keep it short). */
export const PHONE_RECENT_MESSAGES = 6;
export const PHONE_MAX_MEMORIES = 8;
export const PHONE_MAX_OPEN_ITEMS = 12;

/**
 * The context for the on-device model (Android test mode): the same facts the cloud gets, cut to
 * what a 1–2B model can read in a few seconds. Names in the app, no numbers or summaries.
 */
export function renderPhoneContext(ctx: ConversationContext): string {
  const { user, now } = ctx;
  const tz = user.timezone;
  const lines: string[] = [];
  lines.push(`NOW: ${describeNow(now, tz)}`);
  lines.push(`UPCOMING DAYS: ${describeUpcomingDays(now, tz, 8)}`);
  const script = replyScript(userTexts(ctx.recent), user.language === "en" ? "english" : "arabic");
  if (script) lines.push(`REPLY SCRIPT: ${script.split(" (")[0]}`);
  lines.push(`ADDRESS THE USER AS: ${addressAs(ctx.memories, user.gender).split(" (")[0]}`);
  if (user.name) lines.push(`USER NAME: ${user.name}`);
  lines.push(`HELPLINE (only for distress): ${helplineFor(tz)}`);
  const memories = ctx.memories.slice(0, PHONE_MAX_MEMORIES);
  if (memories.length) lines.push(`MEMORIES: ${memories.map((m) => `${m.subject}: ${m.content}`).join(" · ")}`);
  // The most recently touched items first: that is what the user talks about next.
  const items = [...ctx.openItems].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, PHONE_MAX_OPEN_ITEMS);
  lines.push("OPEN ITEMS (ids for updates):");
  lines.push(items.length ? items.map((i) => describeItem(i, tz)).join("\n") : "- (none)");
  const app = ctx.app;
  if (app) {
    const names = (xs: string[]) => (xs.length ? xs.map((x) => `«${x}»`).join(", ") : "none");
    lines.push(`IN THE APP: circles ${app.circles.length ? app.circles.map((c) => `«${c.name}» with ${c.members.filter((m) => m.userId !== user.id).map((m) => m.name ?? "?").join(", ") || "nobody yet"}`).join("; ") : "none"}. Money sections ${names(app.sections.map((s) => s.name))}. Trackers ${names(app.trackers.map((t) => (t.kind === "custom" ? t.name ?? "custom" : t.kind)))}.`);
  }
  return lines.join("\n");
}
