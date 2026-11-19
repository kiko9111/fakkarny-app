import Fastify, { type FastifyBaseLogger, type FastifyServerOptions } from "fastify";
import type { PrismaClient } from "./generated/prisma/client";
import { noopPipeline, type MessagePipeline } from "./pipeline/types";
import { deviceRoutes } from "./routes/devices";
import { healthRoutes } from "./routes/health";
import { itemRoutes } from "./routes/items";
import { messageRoutes } from "./routes/messages";

export interface AppDeps {
  /** Omit to run without a database (only /health is served). */
  prisma?: PrismaClient;
  pipeline?: MessagePipeline;
  /** Alternative to `pipeline` when it needs the app logger. */
  pipelineFactory?: (log: FastifyBaseLogger) => MessagePipeline;
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
    const pipeline = deps.pipeline ?? deps.pipelineFactory?.(app.log) ?? noopPipeline;
    app.register(messageRoutes, { prisma: deps.prisma, pipeline, now: deps.now });
    app.register(itemRoutes, { prisma: deps.prisma });
    app.register(deviceRoutes, { prisma: deps.prisma });
  }

  return app;
}
