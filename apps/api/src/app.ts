import Fastify, { type FastifyServerOptions } from "fastify";
import { healthRoutes } from "./routes/health";

export function buildApp(opts: FastifyServerOptions = {}) {
  const app = Fastify({
    ...opts,
    logger:
      opts.logger === undefined
        ? {
            // CLAUDE.md: never log message content. Fastify doesn't log bodies by
            // default; also keep auth headers out of logs.
            redact: ["req.headers.authorization", "req.headers.cookie"],
          }
        : opts.logger,
  });

  app.register(healthRoutes);

  return app;
}
