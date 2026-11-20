import type { FastifyBaseLogger } from "fastify";
import type { FriendResponse } from "@fakkarni/shared";
import type { Prisma } from "../generated/prisma/client";
import { costUsd, FRIEND_MODEL, type ChatTurn, type FriendModel, type Usage } from "../ai/model";
import { helplineFor, PERSONA_PROMPT, PERSONA_VERSION } from "../persona/prompt";
import { localToUtc, toLocalIso } from "../lib/time";
import { applyActions } from "./apply";
import { loadContext, mustReplyInArabic, renderContext, userTexts } from "./context";
import { detectScript, FALLBACK_REPLY, fastReply, helplineMessage, looksLikeCrisis, replyLang, type ReplyLang } from "./rules";
import { summarizeIfNeeded } from "./summarize";
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

const CAP_REPLY: Record<ReplyLang, string> = {
  arabic: "وصلنا لحد الكلام بتاع النهارده 😅 هفضل فاكر كل اللي تبعته، ونكمل كلامنا عادي بكرة.",
  english: "We've hit today's chat limit 😅 I'll still keep everything you send, and full replies are back tomorrow.",
};

export function createConversationPipeline(deps: { model: FriendModel; log?: FastifyBaseLogger; dailyCap?: number }): MessagePipeline {
  const { model, log } = deps;
  const dailyCap = deps.dailyCap ?? DAILY_MESSAGE_CAP;

  return async ({ prisma, user, message, now }) => {
    const script = replyLang(detectScript(message.text));
    const crisisKeyword = looksLikeCrisis(message.text);

    // 0. Fair-use cap (never applied to crisis messages).
    if (!crisisKeyword) {
      const dayStart = localToUtc(`${toLocalIso(now, user.timezone).slice(0, 10)}T00:00`, user.timezone);
      const today = await prisma.message.count({ where: { userId: user.id, role: "user", createdAt: { gte: dayStart } } });
      if (today > dailyCap) {
        // Tell them once, honestly; after that just save quietly.
        const replies = today === dailyCap + 1 ? [CAP_REPLY[script]] : [];
        if (replies.length) await event(prisma, user.id, "daily_cap_hit", {});
        return applyActions(prisma, { user, message, replies, response: EMPTY_ACTIONS, now });
      }
    }

    // 1. Rules fast path: no AI for messages that carry nothing to remember.
    const canned = crisisKeyword ? null : fastReply(message.text, script);
    if (canned) {
      await event(prisma, user.id, "reply_fast_path", {});
      return applyActions(prisma, { user, message, replies: [canned], response: EMPTY_ACTIONS, now });
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
        purpose: "chat",
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

    return applied;
  };
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
