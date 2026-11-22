import type { FastifyBaseLogger } from "fastify";
import { SessionMode, type Session as WireSession, type SessionMessage as WireMessage } from "@fakkarni/shared";
import { costUsd, FRIEND_MODEL, type ChatTurn, type FriendModel } from "../ai/model";
import type { PrismaClient, ReflectMessage, ReflectSession, User } from "../generated/prisma/client";
import { localToUtc, toLocalIso } from "../lib/time";
import { helplineFor } from "../persona/prompt";
import { SESSION_PROMPT, SESSION_PROMPT_VERSION } from "../persona/session";
import { detectScript, helplineMessage, looksLikeCrisis, replyLang, type ReplyLang } from "../pipeline/rules";
import { atMessageCap, CAP_LINE, CRISIS_CARE, SESSION_FALLBACK } from "./rules";

export type SessionWithMessages = ReflectSession & { messages: ReflectMessage[] };

export const toWireMessage = (m: ReflectMessage): WireMessage => ({
  id: m.id,
  role: m.role === "user" ? "user" : "zaki",
  text: m.text,
  created_at: m.createdAt.toISOString(),
  step: m.stepTitle ? { title: m.stepTitle, remind_at: m.stepAt?.toISOString() ?? null, accepted: m.stepAccepted } : null,
});

export const toWireSession = (s: SessionWithMessages): WireSession => ({
  id: s.id,
  mode: SessionMode.catch("talk").parse(s.mode),
  mood: Math.min(5, Math.max(1, s.mood)),
  started_at: s.startedAt.toISOString(),
  ended_at: s.endedAt?.toISOString() ?? null,
  messages: [...s.messages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map(toWireMessage),
});

/** A timestamp after everything already in the session, so order survives same-millisecond writes. */
export function nextAt(s: SessionWithMessages, now: Date): Date {
  const last = s.messages.reduce((max, m) => Math.max(max, m.createdAt.getTime()), 0);
  return new Date(Math.max(now.getTime(), last + 1));
}

export const userLang = (user: Pick<User, "language">): ReplyLang => (user.language === "en" ? "english" : "arabic");

/** What the model is told about this person. Deliberately small: no tasks, debts, circles or memories. */
export function renderSessionContext(user: User, s: ReflectSession, now: Date): string {
  return [
    `User's name: ${user.name ?? "unknown"}`,
    `Mode: ${s.mode}`,
    `Mood they tapped at the start (1 = very low, 5 = great): ${s.mood}`,
    `Local time now: ${toLocalIso(now, user.timezone)}`,
    `Helpline to give in a crisis: ${helplineFor(user.timezone)}`,
  ].join("\n");
}

const safeLocal = (local: string | null, tz: string, now: Date): Date | null => {
  if (!local) return null;
  try {
    const at = localToUtc(local.slice(0, 16), tz);
    return Number.isNaN(at.getTime()) || at <= now ? null : at;
  } catch {
    return null;
  }
};

/**
 * One turn: store the user's words, get Zaki's answer, apply the safety net. Returns the new
 * rows in order. Never logs or forwards the text anywhere but the model call itself.
 */
export async function sessionTurn(
  deps: { prisma: PrismaClient; model?: FriendModel; log?: FastifyBaseLogger },
  user: User,
  s: SessionWithMessages,
  text: string,
  now: Date,
): Promise<{ messages: ReflectMessage[]; ended: boolean }> {
  const { prisma } = deps;
  const lang = replyLang(detectScript(text));
  const crisisKeyword = looksLikeCrisis(text);
  const userCount = s.messages.filter((m) => m.role === "user").length;
  const stepGiven = s.messages.some((m) => m.stepTitle);
  const at = nextAt(s, now);
  const mine = await prisma.reflectMessage.create({ data: { sessionId: s.id, role: "user", text, createdAt: at } });

  let replies: string[] = [];
  let crisis = crisisKeyword;
  let step: { title: string; at: Date | null } | null = null;
  let ended = false;

  if (atMessageCap(userCount) && !crisisKeyword) {
    // Long enough for one sitting: close kindly, no model call.
    replies = [CAP_LINE[lang]];
    ended = true;
  } else if (deps.model?.reflect) {
    const history: ChatTurn[] = [...s.messages, mine].map((m) => ({ role: m.role === "user" ? "user" : "assistant", text: m.text }));
    // The opening lines are Zaki's: the model needs a user turn first, which the context message provides.
    try {
      const result = await deps.model.reflect({ system: SESSION_PROMPT, context: renderSessionContext(user, s, now), history });
      await prisma.event.create({ data: { userId: user.id, name: "ai_call", propsJson: { purpose: "session", model: FRIEND_MODEL, persona: SESSION_PROMPT_VERSION, ...result.usage, cost_usd: costUsd(result.usage) } } });
      if (result.ok) {
        replies = result.output.reply;
        crisis ||= result.output.crisis;
        const st = result.output.step;
        if (st?.title.trim() && !stepGiven && s.mode !== "vent") step = { title: st.title.trim().slice(0, 120), at: safeLocal(st.remind_at_local, user.timezone, now) };
      } else {
        deps.log?.warn({ reason: result.reason }, "session model returned no usable output");
      }
    } catch (err) {
      deps.log?.error({ err: (err as Error).name }, "session model call failed");
    }
  }

  if (crisis) {
    // Safety net, same as the main chat: the helpline number is always in the reply, and no step.
    const helpline = helplineFor(user.timezone);
    const digits = helpline.match(/\d{3,}/)?.[0];
    if (replies.length === 0) replies = [CRISIS_CARE[lang]];
    if (!digits || !replies.some((r) => r.includes(digits))) replies = [...replies, helplineMessage(lang, helpline)];
    step = null;
    await prisma.reflectSession.update({ where: { id: s.id }, data: { crisis: true } });
    // Flagged for safety review only; no content (PRD §7).
    await prisma.event.create({ data: { userId: user.id, name: "crisis_flag", propsJson: { keyword: crisisKeyword, session: true } } });
  }
  if (replies.length === 0) replies = [SESSION_FALLBACK[lang]];

  const rows: ReflectMessage[] = [mine];
  for (const [n, reply] of replies.entries()) {
    const last = n === replies.length - 1;
    rows.push(
      await prisma.reflectMessage.create({
        data: { sessionId: s.id, role: "zaki", text: reply, createdAt: new Date(at.getTime() + n + 1), ...(last && step ? { stepTitle: step.title, stepAt: step.at } : {}) },
      }),
    );
  }
  if (ended) await prisma.reflectSession.update({ where: { id: s.id }, data: { endedAt: now } });
  return { messages: rows, ended };
}
