import Fastify, { type FastifyServerOptions } from "fastify";
import type { PrismaClient } from "./generated/prisma/client";
import { noopPipeline, type MessagePipeline } from "./pipeline/types";
import { healthRoutes } from "./routes/health";
import { messageRoutes } from "./routes/messages";

export interface AppDeps {
  /** Omit to run without a database (only /health is served). */
  prisma?: PrismaClient;
  pipeline?: MessagePipeline;
  now?: () => Date;
}

// CLAUDE.md: never log message content. Fastify doesn't log bodies by default;
// also keep auth headers out of logs.
export const LOG_REDACT = ["req.headers.authorization", "req.headers.cookie", 'req.headers["x-install-id"]'];

export function buildApp(opts: FastifyServerOptions = {}, deps: AppDeps = {}) {
  const app = Fastify({
    ...opts,
    logger: opts.logger === undefined ? { redact: LOG_REDACT } : opts.logger,
  });

  app.register(healthRoutes);
  if (deps.prisma) {
    app.register(messageRoutes, { prisma: deps.prisma, pipeline: deps.pipeline ?? noopPipeline, now: deps.now });
  }

  return app;
}
