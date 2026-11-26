import type { FastifyPluginAsync, preHandlerAsyncHookHandler } from "fastify";
import { z } from "zod";
import { ReadReceiptRequest, type ReadReceiptResponse } from "@fakkarni/shared";
import type { PrismaClient } from "../generated/prisma/client";
import { costUsd, FRIEND_MODEL, type FriendModel } from "../ai/model";
import { aiAllowanceToday } from "../billing/allowance";

/**
 * Photos, for two things only (owner decision, 2026-11-23):
 * - POST /receipts/read: the AI reads a receipt photo into amounts and items. The photo is never
 *   stored or logged; the reading counts as one AI message of the day.
 * - GET /photos/:id: a homework page, for the child who handed it in and the parent who set it.
 */
export interface PhotoRoutesOptions {
  prisma: PrismaClient;
  authenticate: preHandlerAsyncHookHandler;
  model?: FriendModel;
  now?: () => Date;
  requireSubscription?: boolean;
}

export const photoRoutes: FastifyPluginAsync<PhotoRoutesOptions> = async (app, opts) => {
  const { prisma } = opts;
  const now = opts.now ?? (() => new Date());
  app.addHook("preHandler", opts.authenticate);

  app.post("/receipts/read", { bodyLimit: 6 * 1024 * 1024, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const body = ReadReceiptRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    if (!opts.model?.readReceipt) return reply.code(503).send({ error: "unavailable" });
    const user = req.user;
    const at = now();
    // Same daily allowance as chat: a receipt is one AI message.
    const { limit, used } = await aiAllowanceToday(prisma, user, at, opts.requireSubscription);
    if (limit !== null && used >= limit) {
      const res: ReadReceiptResponse = { receipt: null, error: "limit", ai_allowance: { limit, used } };
      return res;
    }
    let result: Awaited<ReturnType<NonNullable<FriendModel["readReceipt"]>>>;
    try {
      result = await opts.model.readReceipt({ photo: body.data.photo, language: user.language === "en" ? "en" : "ar" });
    } catch {
      return reply.code(503).send({ error: "unavailable" });
    }
    await prisma.event.createMany({
      data: [
        { userId: user.id, name: "ai_call", propsJson: { purpose: "chat", photo: "receipt", model: FRIEND_MODEL, ...result.usage, cost_usd: costUsd(result.usage) } },
        { userId: user.id, name: "receipt_read", propsJson: { ok: Boolean(result.receipt), items: result.receipt?.items.length ?? 0 } },
      ],
    });
    const res: ReadReceiptResponse = { receipt: result.receipt, error: result.receipt ? null : "unreadable", ai_allowance: { limit, used: used + 1 } };
    return res;
  });

  app.get("/photos/:id", async (req, reply) => {
    const p = z.object({ id: z.uuid() }).safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: "not_found" });
    const photo = await prisma.photo.findFirst({
      where: { id: p.data.id, expiresAt: { gt: now() }, OR: [{ userId: req.user.id }, { task: { OR: [{ assignerId: req.user.id }, { assigneeId: req.user.id }] } }] },
      select: { mime: true, data: true },
    });
    if (!photo) return reply.code(404).send({ error: "not_found" });
    return reply.type(photo.mime).header("cache-control", "private, max-age=86400").send(Buffer.from(photo.data));
  });
};
