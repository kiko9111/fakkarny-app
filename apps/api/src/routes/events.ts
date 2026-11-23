import type { FastifyPluginAsync, preHandlerAsyncHookHandler } from "fastify";
import { PostEventsRequest } from "@fakkarni/shared";
import type { PrismaClient } from "../generated/prisma/client";

const WEEK_MS = 7 * 86_400_000;

/**
 * Product analytics from the phone (packages/shared/src/analytics.ts): counted events with short
 * labels, stored as Event rows named "app:<name>". Never message content.
 */
export const eventRoutes: FastifyPluginAsync<{ prisma: PrismaClient; authenticate: preHandlerAsyncHookHandler; now?: () => Date }> = async (app, opts) => {
  const { prisma } = opts;
  const now = opts.now ?? (() => new Date());
  app.addHook("preHandler", opts.authenticate);

  app.post("/events", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const body = PostEventsRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    const at = now();
    await prisma.event.createMany({
      data: body.data.events.map((e) => {
        // A phone clock can be anywhere: keep the time inside the last week and never in the future.
        const t = Math.min(at.getTime(), Math.max(at.getTime() - WEEK_MS, new Date(e.at).getTime()));
        return { userId: req.user.id, name: `app:${e.name}`, propsJson: e.props, createdAt: new Date(t) };
      }),
    });
    return reply.code(204).send();
  });
};
