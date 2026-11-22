import type { FastifyPluginAsync } from "fastify";
import {
  ListMessagesQuery,
  PostMessageRequest,
  type ListMessagesResponse,
  type PostMessageResponse,
} from "@fakkarni/shared";
import { Prisma, type PrismaClient } from "../generated/prisma/client";
import { coveredByFamilyPlan } from "../billing/family";
import { dailyAiAllowance } from "../billing/plan";
import type { MessagePipeline } from "../pipeline/types";
import type { preHandlerAsyncHookHandler } from "fastify";
import { toWireItem, toWireMemory, toWireMessage } from "../serialize";

export interface MessageRoutesOptions {
  prisma: PrismaClient;
  pipeline: MessagePipeline;
  now?: () => Date;
  authenticate: preHandlerAsyncHookHandler;
  /** Enforce the free plan's daily AI allowance (Pro is unlimited, fair use). */
  requireSubscription?: boolean;
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
      user = await prisma.user.update({ where: { id: user.id }, data: { timezone: body.data.timezone } });
    }

    // Idempotency: a retried client_id returns what was stored the first time.
    const existing = await prisma.message.findUnique({
      where: { userId_clientId: { userId: user.id, clientId: body.data.client_id } },
    });
    if (existing) {
      const res: PostMessageResponse = {
        message: toWireMessage(existing),
        replies: (await prisma.message.findMany({
          where: { userId: user.id, clientId: { startsWith: `${existing.clientId}:reply:` } },
          orderBy: { clientId: "asc" },
        })).map(toWireMessage),
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
    const last = await prisma.message.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
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

    // The user answered: reset the check-in slowdown (F7) and note when they last wrote.
    user = await prisma.user.update({
      where: { id: user.id },
      data: { lastUserMessageAt: message.createdAt, ignoredCheckins: 0, slowdownNoticed: false },
    });

    // Chat is never locked: free users get a daily AI allowance, then a warm Pro nudge.
    let aiAllowance = opts.requireSubscription ? dailyAiAllowance(user, now()) : null;
    if (aiAllowance !== null && (await coveredByFamilyPlan(prisma, user.id, now()))) aiAllowance = null;
    const result = await pipeline({ prisma, user, message, now: now(), aiAllowance });
    const res: PostMessageResponse = {
      message: toWireMessage(message),
      replies: result.replies.map(toWireMessage),
      items: result.items.map(toWireItem),
      memories: result.memories.map(toWireMemory),
      duplicate: false,
      ...(result.aiAllowance ? { ai_allowance: result.aiAllowance } : {}),
    };
    return reply.code(201).send(res);
  });

  app.get("/messages", async (req, reply) => {
    const q = ListMessagesQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "invalid_query", issues: q.error.issues });
    const rows = await prisma.message.findMany({
      where: { userId: req.user.id, ...(q.data.after ? { createdAt: { gt: new Date(q.data.after) } } : {}) },
      orderBy: { createdAt: "asc" },
      take: q.data.limit,
    });
    const res: ListMessagesResponse = { messages: rows.map(toWireMessage) };
    return res;
  });
};
