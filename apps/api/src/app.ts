import { createHash } from "node:crypto";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyBaseLogger, type FastifyRequest, type FastifyServerOptions } from "fastify";
import { INSTALL_ID_HEADER } from "@fakkarni/shared";
import type { PrismaClient } from "./generated/prisma/client";
import { createMetrics, type Metrics } from "./observability/metrics";
import { Sentry } from "./observability/sentry";
import { noopPipeline, type MessagePipeline } from "./pipeline/types";
import { requireUser, type AuthConfig } from "./plugins/auth";
import { adminRoutes } from "./routes/admin";
import { billingRoutes } from "./routes/billing";
import { deviceRoutes } from "./routes/devices";
import { healthRoutes } from "./routes/health";
import { itemRoutes } from "./routes/items";
import { legalRoutes, type LegalOptions } from "./routes/legal";
import { meRoutes } from "./routes/me";
import { messageRoutes } from "./routes/messages";
import { referralRoutes } from "./routes/referrals";
import { circleRoutes } from "./routes/circles";
import { invitePageRoutes } from "./routes/invite-page";
import { daftarRoutes } from "./routes/daftar";
import { daftarPageRoutes } from "./routes/daftar-page";

export interface AppDeps {
  /** Omit to run without a database (only /health is served). */
  prisma?: PrismaClient;
  pipeline?: MessagePipeline;
  /** Alternative to `pipeline` when it needs the app logger. */
  pipelineFactory?: (log: FastifyBaseLogger) => MessagePipeline;
  now?: () => Date;
  /** Defaults to install-ID identity only (development and tests). */
  auth?: AuthConfig;
  deleteAuthUser?: (sub: string) => Promise<void>;
  /** Invite links: where they point, and the store link offered after the web confirm. */
  invites?: { publicUrl?: string; storeUrl?: string };
  billing?: { requireSubscription: boolean; webhookAuth?: string; revenueCatSecretKey?: string; fetchImpl?: typeof fetch };
  /** FR-15 dashboard password (HTTP Basic, user "admin"). The dashboard is off without it. */
  adminPassword?: string;
  /** Requests per minute per caller (default 120); false disables rate limiting. */
  rateLimitPerMinute?: number | false;
  /** Send unhandled errors to Sentry (initSentry must have run). */
  sentry?: boolean;
  metrics?: Metrics;
  /** Contact details and review status for the public /legal pages. */
  legal?: LegalOptions;
}

// CLAUDE.md: never log message content. Fastify doesn't log bodies by default;
// also keep auth headers out of logs.
export const LOG_REDACT = ["req.headers.authorization", "req.headers.cookie", 'req.headers["x-install-id"]'];

/** Rate-limit key: the caller's identity (hashed, never stored raw), else their IP. */
function callerKey(req: FastifyRequest): string {
  const id = req.headers.authorization ?? req.headers[INSTALL_ID_HEADER];
  return typeof id === "string" && id ? createHash("sha256").update(id).digest("hex").slice(0, 32) : req.ip;
}

export function buildApp(opts: FastifyServerOptions = {}, deps: AppDeps = {}) {
  const app = Fastify({
    ...opts,
    logger: opts.logger === undefined ? { redact: LOG_REDACT } : opts.logger,
  });
  const metrics = deps.metrics ?? createMetrics();

  if (deps.sentry) Sentry.setupFastifyErrorHandler(app);
  app.addHook("onResponse", async (_req, reply) => metrics.record(reply.statusCode));

  if (deps.rateLimitPerMinute !== false) {
    app.register(rateLimit, {
      max: deps.rateLimitPerMinute ?? 120,
      timeWindow: "1 minute",
      keyGenerator: callerKey,
      allowList: (req) => req.url === "/health",
    });
  }

  app.register(healthRoutes);
  app.register(legalRoutes, deps.legal ?? {});
  if (deps.prisma) {
    const prisma = deps.prisma;
    const auth = deps.auth ?? { allowInstallId: true };
    const authenticate = requireUser(prisma, auth);
    const pipeline = deps.pipeline ?? deps.pipelineFactory?.(app.log) ?? noopPipeline;
    const billing = deps.billing ?? { requireSubscription: false };
    app.register(messageRoutes, { prisma, pipeline, now: deps.now, authenticate, requireSubscription: billing.requireSubscription });
    app.register(billingRoutes, { prisma, authenticate, ...billing });
    app.register(referralRoutes, { prisma, authenticate, now: deps.now });
    app.register(circleRoutes, { prisma, authenticate, now: deps.now, publicUrl: deps.invites?.publicUrl });
    app.register(invitePageRoutes, { prisma, now: deps.now, storeUrl: deps.invites?.storeUrl });
    app.register(daftarRoutes, { prisma, authenticate, now: deps.now, publicUrl: deps.invites?.publicUrl });
    app.register(daftarPageRoutes, { prisma, now: deps.now, storeUrl: deps.invites?.storeUrl });
    app.register(itemRoutes, { prisma, authenticate });
    app.register(deviceRoutes, { prisma, authenticate });
    app.register(meRoutes, { prisma, auth, authenticate, deleteAuthUser: deps.deleteAuthUser });
    if (deps.adminPassword) app.register(adminRoutes, { prisma, password: deps.adminPassword, metrics, now: deps.now });
  }

  return app;
}
