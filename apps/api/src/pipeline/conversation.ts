import type { FastifyBaseLogger } from "fastify";
import { TRACKER_TEMPLATES, type FriendResponse, type TrackerKind } from "@fakkarni/shared";
import type { Prisma } from "../generated/prisma/client";
import { costUsd, FRIEND_MODEL, type ChatTurn, type FriendModel, type Usage } from "../ai/model";
import { helplineFor, PERSONA_PROMPT, PERSONA_VERSION } from "../persona/prompt";
import { localToUtc, toLocalIso } from "../lib/time";
import { applyActions } from "./apply";
import { loadContext, mustReplyInArabic, renderContext, userTexts } from "./context";
import { detectScript, FALLBACK_REPLY, fastReply, helplineMessage, looksDistressed, looksLikeCrisis, looksLikeReminderWork, replyLang, type ReplyLang } from "./rules";
import { summarizeIfNeeded } from "./summarize";
import { logEntry, loggedLine, toWireTracker, trackerFastPath } from "../trackers/store";
import { isPlainYes, pendingStatus, statusDoneReply } from "../proactive/status";
import type { MessagePipeline } from "./types";

const EMPTY_ACTIONS: Pick<FriendResponse, "create_items" | "update_items" | "save_memories"> = {
  create_items: [],
  update_items: [],
  save_memories: [],
};

/**
 * PRD §6 conversation pipeline: context → one Claude call (reply + actions) → zod-validated
 * actions applied in a transaction. Never logs message content (CLAUDE.md).
 */
/** PRD §7 cost lever: a soft daily cap for heavy chatters (messages still saved, AI paused). */
export const DAILY_MESSAGE_CAP = 150;
/**
 * Reminder messages past the free allowance still reach the model ("reminders stay free"),
 * up to this many a day, so the bypass can't become unlimited free chat.
 */
export const FREE_REMINDER_CALLS_PER_DAY = 20;

const CAP_REPLY: Record<ReplyLang, string> = {
  arabic: "وصلنا لحد الكلام بتاع النهارده 😅 هفضل فاكر كل اللي تبعته، ونكمل كلامنا عادي بكرة.",
  english: "We've hit today's chat limit 😅 I'll still keep everything you send, and full replies are back tomorrow.",
};

/** Free AI allowance used up: Zaki says so warmly (no AI call), with a Pro button. */
const ALLOWANCE_FIRST: Record<ReplyLang, string> = {
  arabic: "خلّصنا رسايلي المجانية بتاعة النهارده 🌟 بكرة نكمّل من تاني، وكل حاجة سجلناها محفوظة. ولو حابب نتكلم من غير حد، زكي برو مستنيك.",
  english: "That's all my free messages for today 🌟 We'll pick up again tomorrow, and everything we saved is safe. If you'd like to keep chatting with no limit, Zaki Pro is here for you.",
};
const ALLOWANCE_AGAIN: Record<ReplyLang, string> = {
  arabic: "رسايل النهارده خلصت، بس رسالتك وصلتني ومحفوظة. نكمّل بكرة إن شاء الله 🌟",
  english: "Today's messages are used up, but I've kept yours. Talk tomorrow 🌟",
};

export function createConversationPipeline(deps: { model: FriendModel; log?: FastifyBaseLogger; dailyCap?: number }): MessagePipeline {
  const { model, log } = deps;
  const dailyCap = deps.dailyCap ?? DAILY_MESSAGE_CAP;

  return async ({ prisma, user, message, now, aiAllowance }) => {
    const script = replyLang(detectScript(message.text));
    const crisisKeyword = looksLikeCrisis(message.text);
    const dayStart = localToUtc(`${toLocalIso(now, user.timezone).slice(0, 10)}T00:00`, user.timezone);

    // 0. Fair-use cap (never applied to crisis messages).
    if (!crisisKeyword) {
      const today = await prisma.message.count({ where: { userId: user.id, role: "user", createdAt: { gte: dayStart } } });
      if (today > dailyCap) {
        // Tell them once, honestly; after that just save quietly.
        const replies = today === dailyCap + 1 ? [CAP_REPLY[script]] : [];
        if (replies.length) await event(prisma, user.id, "daily_cap_hit", {});
        return applyActions(prisma, { user, message, replies, response: EMPTY_ACTIONS, now });
      }
    }

    // 0a. A plain "yes" to Zaki's status check ("did you get to …?") closes it by rules.
    const status = crisisKeyword ? null : await answerStatusCheck(prisma, user, message, script, now);
    if (status?.result) return status.result;
    // Any other answer to a status check ("not yet, tomorrow") is reminder work: free past the allowance.
    const answersStatus = status?.pending === true;

    // 1. Rules fast path: no AI for messages that carry nothing to remember.
    const canned = crisisKeyword ? null : fastReply(message.text, script);
    if (canned) {
      await event(prisma, user.id, "reply_fast_path", {});
      return applyActions(prisma, { user, message, replies: [canned], response: EMPTY_ACTIONS, now });
    }

    // 1a. Trackers by rules: "شربت مية" logs, "تابع معايا المية" starts one. No AI, no allowance used.
    const tracked = crisisKeyword ? null : await trackerFastPath(prisma, user, message.text, script, now);
    const closesReminder = tracked?.closesReminder === true;
    if (tracked && !closesReminder) {
      await event(prisma, user.id, "reply_fast_path", { tracker: true });
      return applyActions(prisma, { user, message, replies: [tracked.text], response: EMPTY_ACTIONS, now, ...(tracked.upsell ? { replyKind: "upsell" as const } : {}) });
    }

    // 1b. Free AI allowance. Rule-answered messages above don't count. Distress is never
    // blocked (the model must see it, to answer with care and flag a crisis), and reminder
    // work (asking for one, Done / Later) stays free up to a daily guard.
    const limit = aiAllowance ?? null;
    let used = 0;
    let freeCall: "distress" | "reminder" | null = null;
    if (limit !== null) {
      used = await prisma.event.count({
        where: { userId: user.id, name: "ai_call", createdAt: { gte: dayStart }, propsJson: { path: ["purpose"], equals: "chat" } },
      });
      if (used >= limit) {
        if (crisisKeyword || looksDistressed(message.text)) freeCall = "distress";
        else if (closesReminder || answersStatus || looksLikeReminderWork(message.text)) {
          const freeToday = await prisma.event.count({
            where: { userId: user.id, name: "ai_call", createdAt: { gte: dayStart }, propsJson: { path: ["free"], equals: "reminder" } },
          });
          if (freeToday < FREE_REMINDER_CALLS_PER_DAY) freeCall = "reminder";
        }
      }
      if (used >= limit && !freeCall) {
        const toldToday = await prisma.event.count({ where: { userId: user.id, name: "ai_allowance_hit", createdAt: { gte: dayStart } } });
        await event(prisma, user.id, "ai_allowance_hit", { limit });
        const reply = toldToday === 0 ? ALLOWANCE_FIRST[script] : ALLOWANCE_AGAIN[script];
        const applied = await applyActions(prisma, { user, message, replies: [reply], response: EMPTY_ACTIONS, now, replyKind: "upsell" });
        return { ...applied, aiAllowance: { limit, used } };
      }
    }

    // 2. One model call with persona (cached) + context + recent chat.
    const ctx = await loadContext(prisma, user, now);
    const history: ChatTurn[] = ctx.recent.map((m) => ({ role: m.role === "user" ? "user" : "assistant", text: m.text }));
    let replies: string[];
    let actions = EMPTY_ACTIONS;
    let crisis = crisisKeyword;
    let usage: Usage | null = null;
    try {
      const result = await model.respond({ system: PERSONA_PROMPT, context: renderContext(ctx), history, requireArabic: mustReplyInArabic(userTexts(ctx.recent), user.language === "en" ? "english" : "arabic"), todayLocal: toLocalIso(now, user.timezone).slice(0, 10) });
      usage = result.usage;
      if (result.ok) {
        replies = result.output.reply;
        actions = result.output;
        crisis ||= result.output.crisis;
      } else {
        log?.warn({ reason: result.reason }, "friend model returned no usable output");
        replies = [FALLBACK_REPLY[script]];
      }
    } catch (err) {
      log?.error({ err: errorSummary(err) }, "friend model call failed");
      replies = [FALLBACK_REPLY[script]];
    }

    // 3. Wellbeing safety net: crisis replies always carry helpline info, and never create items.
    if (crisis) {
      const helpline = helplineFor(user.timezone);
      const digits = helpline.match(/\d{3,}/)?.[0];
      if (!digits || !replies.some((r) => r.includes(digits))) replies = [...replies, helplineMessage(script, helpline)];
      actions = EMPTY_ACTIONS;
      // Flagged for safety review only, never marketing; no content stored (PRD §7).
      await event(prisma, user.id, "crisis_flag", { keyword: crisisKeyword });
    }

    // 4. Apply actions + store replies.
    const applied = await applyActions(prisma, { user, message, replies, response: actions, now });

    if (usage) {
      await event(prisma, user.id, "ai_call", {
        // Calls let through past the allowance don't count against it.
        purpose: freeCall ? "chat_free" : "chat",
        ...(freeCall ? { free: freeCall } : {}),
        model: FRIEND_MODEL,
        persona: PERSONA_VERSION,
        ...usage,
        cost_usd: costUsd(usage),
        items_created: actions.create_items.length,
        items_updated: actions.update_items.length,
        memories_saved: actions.save_memories.length,
      });
    }

    // 5. Rolling summary in the background; never blocks the reply.
    void summarizeIfNeeded(prisma, model, user).catch((err) => log?.warn({ err: errorSummary(err) }, "summary failed"));

    return { ...applied, aiAllowance: { limit, used: used + (usage && !freeCall ? 1 : 0) } };
  };
}

/**
 * Zaki's status checks (proactive/status.ts) store the subject in the message client_id. When
 * the user's message answers the latest one with a plain yes, mark the item done or log the
 * tracker, with a template reply and no AI call. Otherwise say whether a check is pending.
 */
async function answerStatusCheck(prisma: Parameters<MessagePipeline>[0]["prisma"], user: Parameters<MessagePipeline>[0]["user"], message: Parameters<MessagePipeline>[0]["message"], lang: ReplyLang, now: Date): Promise<{ pending: boolean; result?: Awaited<ReturnType<MessagePipeline>> } | null> {
  const lastFriend = await prisma.message.findFirst({ where: { userId: user.id, role: "friend", createdAt: { lte: message.createdAt } }, orderBy: { createdAt: "desc" }, select: { clientId: true, createdAt: true } });
  const pending = pendingStatus(lastFriend, now);
  if (!pending) return null;
  if (!isPlainYes(message.text)) return { pending: true };
  if (pending.kind === "item") {
    const item = await prisma.item.findFirst({ where: { id: pending.id, userId: user.id, status: "open" } });
    if (!item) return { pending: true };
    await event(prisma, user.id, "status_answered", { subject: "item", via: "rules" });
    const result = await applyActions(prisma, { user, message, replies: [statusDoneReply(lang, item)], response: { ...EMPTY_ACTIONS, update_items: [{ id: item.id, status: "done" }] }, now });
    return { pending: true, result };
  }
  const tracker = await prisma.tracker.findFirst({ where: { id: pending.id, userId: user.id } });
  const step = tracker ? TRACKER_TEMPLATES[tracker.kind as TrackerKind]?.step : 0;
  if (!tracker || !step) return { pending: true };
  await logEntry(prisma, tracker.id, step, "chat", now);
  await event(prisma, user.id, "status_answered", { subject: "tracker", via: "rules" });
  const line = loggedLine(lang, await toWireTracker(prisma, tracker, user.timezone, now), step);
  return { pending: true, result: await applyActions(prisma, { user, message, replies: [line], response: EMPTY_ACTIONS, now }) };
}

async function event(prisma: Parameters<MessagePipeline>[0]["prisma"], userId: string, name: string, props: Prisma.InputJsonObject) {
  await prisma.event.create({ data: { userId, name, propsJson: props } });
}

/** Error info that is safe to log (status/type only, never prompt or message text). */
function errorSummary(err: unknown) {
  if (err && typeof err === "object") {
    const e = err as { name?: string; status?: number; code?: string };
    return { name: e.name, status: e.status, code: e.code };
  }
  return { name: "unknown" };
}
