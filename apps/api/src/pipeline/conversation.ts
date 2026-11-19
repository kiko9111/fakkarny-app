import type { FastifyBaseLogger } from "fastify";
import type { FriendResponse } from "@fakkarni/shared";
import type { Prisma } from "../generated/prisma/client";
import { costUsd, FRIEND_MODEL, type ChatTurn, type FriendModel, type Usage } from "../ai/model";
import { helplineFor, PERSONA_PROMPT, PERSONA_VERSION } from "../persona/prompt";
import { applyActions } from "./apply";
import { loadContext, renderContext } from "./context";
import { detectScript, FALLBACK_REPLY, fastReply, helplineMessage, looksLikeCrisis } from "./rules";
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
export function createConversationPipeline(deps: { model: FriendModel; log?: FastifyBaseLogger }): MessagePipeline {
  const { model, log } = deps;

  return async ({ prisma, user, message, now }) => {
    const script = detectScript(message.text);
    const crisisKeyword = looksLikeCrisis(message.text);

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
      const result = await model.respond({ system: PERSONA_PROMPT, context: renderContext(ctx), history });
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
