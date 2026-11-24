import type { FastifyPluginAsync } from "fastify";
import {
  ActOnChatActionRequest,
  ListMessagesQuery,
  PostMessageRequest,
  type ListMessagesResponse,
  type PostMessageResponse,
} from "@fakkarni/shared";
import { Prisma, type PrismaClient } from "../generated/prisma/client";
import { coveredByFamilyPlan } from "../billing/family";
import { dailyAiAllowance } from "../billing/plan";
import type { MessagePipeline } from "../pipeline/types";
import { undoCard } from "../chat/undo";
import { answerCard } from "../chat/actions";
import { storedCards } from "../chat/cards";
import { z } from "zod";
import { pushNotices } from "../proactive/notify";
import type { PushSender } from "../proactive/push";
import type { preHandlerAsyncHookHandler } from "fastify";
import { readsNewKinds, toWireItem, toWireMemory, toWireMessage } from "../serialize";
import type { Message } from "../generated/prisma/client";

/**
 * Messages this server is answering right now. A restart empties it, which is the point: a
 * retried message with no reply that isn't in here lost its reply mid-way and gets answered again.
 */
const inFlight = new Set<string>();
const flightKey = (userId: string, clientId: string) => `${userId}:${clientId}`;

export interface MessageRoutesOptions {
  prisma: PrismaClient;
  pipeline: MessagePipeline;
  now?: () => Date;
  authenticate: preHandlerAsyncHookHandler;
  /** Enforce the free plan's daily AI allowance (Pro is unlimited, fair use). */
  requireSubscription?: boolean;
  push?: PushSender;
}

const isValidTimeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export const messageRoutes: FastifyPluginAsync<MessageRoutesOptions> = async (app, opts) => {
  const { prisma, pipeline } = opts;
  const now = opts.now ?? (() => new Date());
  app.addHook("preHandler", opts.authenticate);

  // Each message is an AI call: a tighter per-caller limit than the global one.
  app.post("/messages", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const body = PostMessageRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body", issues: body.error.issues });
    let user = req.user;

    // Keep the user's time zone current (relative dates resolve in it).
    if (body.data.timezone && body.data.timezone !== user.timezone && isValidTimeZone(body.data.timezone)) {
      user = await prisma.user.update({ where: { id: user.id }, data: { timezone: body.data.timezone, nextTickAt: null } });
    }

    // Idempotency: a retried client_id returns what was stored the first time.
    // Both lookups at once: each round trip to the database adds to the wait for the reply.
    const [existing, last] = await Promise.all([
      prisma.message.findUnique({ where: { userId_clientId: { userId: user.id, clientId: body.data.client_id } } }),
      prisma.message.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    ]);
    if (existing) {
      const stored = await prisma.message.findMany({
        where: { userId: user.id, clientId: { startsWith: `${existing.clientId}:reply:` } },
        orderBy: { clientId: "asc" },
      });
      if (stored.length === 0) {
        // No reply yet. Still being worked on here (the phone gave up waiting): ask it to try
        // again shortly. Not being worked on means the work died (a server restart mid-reply),
        // and the message would never get an answer, so answer it now.
        if (inFlight.has(flightKey(user.id, existing.clientId))) return reply.code(409).send({ error: "duplicate_in_flight" });
        return reply.code(201).send(await answer(existing));
      }
      const res: PostMessageResponse = {
        message: toWireMessage(existing, readsNewKinds(req)),
        replies: stored.map((m) => toWireMessage(m, readsNewKinds(req))),
        items: (await prisma.item.findMany({ where: { sourceMessageId: existing.id } })).map(toWireItem),
        memories: [],
        duplicate: true,
      };
      return reply.code(200).send(res);
    }

    // The phone's timestamp is when the user wrote it (it may have been offline), but the
    // conversation is ordered by arrival: never before the last stored message (e.g. the
    // friend's previous reply) and never in the future.
    const sentAt = new Date(body.data.created_at);
    let createdAt = sentAt > now() ? now() : sentAt;
    if (last && createdAt <= last.createdAt) createdAt = new Date(last.createdAt.getTime() + 1);

    let message;
    try {
      message = await prisma.message.create({
        data: { userId: user.id, role: "user", kind: "chat", text: body.data.text, clientId: body.data.client_id, createdAt },
      });
    } catch (err) {
      // Lost a race with a concurrent retry of the same client_id: let the client retry.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return reply.code(409).send({ error: "duplicate_in_flight" });
      }
      throw err;
    }

    return reply.code(201).send(await answer(message));

    async function answer(message: Message): Promise<PostMessageResponse> {
    const key = flightKey(user.id, message.clientId);
    inFlight.add(key);
    try {
    // The user answered: reset the check-in slowdown (F7) and note when they last wrote.
    // (Written alongside the reply; nothing below reads these fields.)
    const touched = prisma.user.update({
      where: { id: user.id },
      data: { lastUserMessageAt: message.createdAt, ignoredCheckins: 0, slowdownNoticed: false },
    });
    touched.catch(() => {});

    // Chat is never locked: free users get a daily AI allowance, then a warm Pro nudge.
    let aiAllowance = opts.requireSubscription ? dailyAiAllowance(user, now()) : null;
    if (aiAllowance !== null && (await coveredByFamilyPlan(prisma, user.id, now()))) aiAllowance = null;
    const result = await pipeline({ prisma, user, message, now: now(), aiAllowance, requireSubscription: opts.requireSubscription ?? false });
    if (result.notices?.length) void pushNotices(prisma, opts.push, result.notices, app.log);
    await Promise.all([touched, countIntent(prisma, user.id, message.id, result).catch(() => {})]);
    const res: PostMessageResponse = {
      message: toWireMessage(message, readsNewKinds(req)),
      replies: result.replies.map((m) => toWireMessage(m, readsNewKinds(req))),
      items: result.items.map(toWireItem),
      memories: result.memories.map(toWireMemory),
      duplicate: false,
      ...(result.aiAllowance ? { ai_allowance: result.aiAllowance } : {}),
    };
    return res;
    } finally {
      inFlight.delete(key);
    }
    }
  });

  app.get("/messages", async (req, reply) => {
    const q = ListMessagesQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "invalid_query", issues: q.error.issues });
    const rows = await prisma.message.findMany({
      where: { userId: req.user.id, ...(q.data.after ? { createdAt: { gt: new Date(q.data.after) } } : {}) },
      orderBy: { createdAt: "asc" },
      take: q.data.limit,
    });
    const res: ListMessagesResponse = { messages: rows.map((m) => toWireMessage(m, readsNewKinds(req))) };
    return res;
  });

  /** Send or cancel one of Zaki's waiting action cards ("Ask Mona to buy bread?"). */
  app.post("/messages/:id/actions/:actionId", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const p = ActionParam.safeParse(req.params);
    const body = ActOnChatActionRequest.safeParse(req.body);
    if (!p.success) return reply.code(404).send({ error: "not_found" });
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    const msg = await prisma.message.findFirst({ where: { id: p.data.id, userId: req.user.id } });
    const cards = storedCards(msg?.actionsJson);
    const at = cards.findIndex((c) => c.id === p.data.actionId);
    if (!msg || at < 0) return reply.code(404).send({ error: "not_found" });
    const { card, notices } =
      "undo" in body.data
        ? { card: await undoCard(prisma, req.user, cards[at]!, msg.createdAt, now()), notices: [] }
        : await answerCard(prisma, req.user, cards[at]!, body.data.confirm, now(), { requireSubscription: opts.requireSubscription ?? false });
    cards[at] = card;
    const saved = await prisma.message.update({ where: { id: msg.id }, data: { actionsJson: cards as unknown as Prisma.InputJsonValue } });
    if (notices.length) void pushNotices(prisma, opts.push, notices, app.log);
    return { message: toWireMessage(saved, readsNewKinds(req)) };
  });
};

const ActionParam = z.object({ id: z.uuid(), actionId: z.uuid() });

/**
 * Analytics: what one chat turn did, counted (owner ask 2026-11-23: count anything in the chat,
 * never the words). Item types, memories, card kinds and the reply kind; no text, no amounts.
 */
async function countIntent(
  prisma: PrismaClient,
  userId: string,
  messageId: string,
  result: { replies: { kind: string; actionsJson?: unknown }[]; items: { type: string; sourceMessageId: string | null; remindAt: Date | null }[]; memories: unknown[] },
) {
  const props: Record<string, number | string> = {};
  for (const i of result.items) {
    if (i.sourceMessageId !== messageId) continue;
    const key = i.type === "debt" ? "debts" : i.remindAt ? "reminders" : `${i.type}s`;
    props[key] = (Number(props[key]) || 0) + 1;
  }
  if (result.memories.length) props.memories = result.memories.length;
  const kinds = result.replies.flatMap((r) => (Array.isArray(r.actionsJson) ? (r.actionsJson as { kind?: unknown }[]).map((c) => String(c.kind ?? "")) : [])).filter(Boolean);
  if (kinds.length) props.actions = [...new Set(kinds)].join(",").slice(0, 60);
  const kind = result.replies.find((r) => r.kind !== "chat")?.kind;
  if (kind) props.reply = kind;
  props.intent = Object.keys(props).length ? "act" : "talk";
  await prisma.event.create({ data: { userId, name: "chat_intent", propsJson: props } });
}
