import { createHash } from "node:crypto";
import rateLimit from "@fastify/rate-limit";
import { registerIdempotency } from "./plugins/idempotency";
import { registerGzip } from "./plugins/gzip";
import Fastify, { type FastifyBaseLogger, type FastifyRequest, type FastifyServerOptions } from "fastify";
import { INSTALL_ID_HEADER, REPLY_STREAM_HEADER } from "@fakkarni/shared";
import type { PrismaClient } from "./generated/prisma/client";
import { createMetrics, type Metrics } from "./observability/metrics";
import { Sentry } from "./observability/sentry";
import { noopPipeline, type MessagePipeline } from "./pipeline/types";
import { forgetCachedUser, requireUser, type AuthConfig } from "./plugins/auth";
import { adminRoutes } from "./routes/admin";
import { billingRoutes } from "./routes/billing";
import { bootstrapRoutes, isInternal } from "./routes/bootstrap";
import { deviceRoutes } from "./routes/devices";
import { healthRoutes } from "./routes/health";
import { itemRoutes } from "./routes/items";
import { legalRoutes, type LegalOptions } from "./routes/legal";
import { meRoutes } from "./routes/me";
import { messageRoutes } from "./routes/messages";
import { referralRoutes } from "./routes/referrals";
import { eventRoutes } from "./routes/events";
import { referralPageRoutes } from "./routes/referral-page";
import { splitPageRoutes, splitRoutes } from "./routes/splits";
import { cardRoutes } from "./routes/cards";
import { photoRoutes } from "./routes/photos";
import { circleRoutes } from "./routes/circles";
import { invitePageRoutes } from "./routes/invite-page";
import { daftarRoutes } from "./routes/daftar";
import { daftarPageRoutes } from "./routes/daftar-page";
import { taskRoutes } from "./routes/tasks";
import { feedRoutes } from "./routes/feed";
import { moneyRoutes } from "./routes/money";
import { trackerRoutes } from "./routes/trackers";
import { sessionRoutes } from "./routes/session";
import type { FriendModel } from "./ai/model";
import type { PushSender } from "./proactive/push";

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
  /** The model, for Session turns (the chat gets it through `pipeline`). Session answers with a fallback without it. */
  model?: FriendModel;
  /** Session is served only when this is true (SESSION_ENABLED=1). */
  sessionEnabled?: boolean;
  /** Free push for lines Zaki writes to other people (task requests, nudges). Off when absent. */
  push?: PushSender;
  /** FR-15 dashboard password (HTTP Basic, user "admin"). The dashboard is off without it. */
  adminPassword?: string;
  /** Reuse a caller's user row for this long on reads (plugins/auth.ts). Off (0) by default. */
  userCacheMs?: number;
  /** True while this server sends chat replies as they are written: every answer then says so, and phones ask for them. */
  liveReplies?: () => boolean;
  /** Requests per minute per caller (default 600); false disables rate limiting. */
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
  // A phone asks for a reply as it is written only from a server that says it sends one
  // (apps/mobile/src/sync/stream.ts), so this line is also the way to stop the asking.
  const liveReplies = deps.liveReplies;
  if (liveReplies) {
    app.addHook("onRequest", async (_req, reply) => {
      if (liveReplies()) reply.header(REPLY_STREAM_HEADER, "1");
    });
  }

  if (deps.rateLimitPerMinute !== false) {
    app.register(rateLimit, {
      // 120 a minute is easy for one phone to use up (parallel screen loads, background pulls),
      // and then every screen fails while chat (its own limit) still works.
      max: deps.rateLimitPerMinute ?? 600,
      timeWindow: "1 minute",
      keyGenerator: callerKey,
      // Who hits the limit, and where (route and a short key hash; never content).
      onExceeded: (req, key) => req.log.warn({ route: req.routeOptions?.url ?? req.url.split("?")[0], key: key.slice(0, 8) }, "rate_limited"),
      // GET /bootstrap asks this same server for each tab: those inner requests are the one call.
      allowList: (req) => req.url === "/health" || isInternal(req),
    });
  }

  // Offline taps replayed from the phone are applied once (plugins/idempotency.ts).
  registerIdempotency(app);
  // After the hooks that read an answer as text: big text answers leave gzipped.
  registerGzip(app);
  app.register(healthRoutes);
  app.register(legalRoutes, deps.legal ?? {});
  if (deps.prisma) {
    const prisma = deps.prisma;
    const auth = deps.auth ?? { allowInstallId: true };
    // Reads reuse the caller's user row for a few seconds; the caller's own write drops it
    // the moment that write is answered (plugins/auth.ts).
    const authenticate = requireUser(prisma, auth, undefined, deps.userCacheMs ?? 0);
    app.addHook("onSend", async (req) => {
      if (req.forgetUser) forgetCachedUser(req.forgetUser);
    });
    const pipeline = deps.pipeline ?? deps.pipelineFactory?.(app.log) ?? noopPipeline;
    const billing = deps.billing ?? { requireSubscription: false };
    app.register(messageRoutes, { prisma, pipeline, now: deps.now, authenticate, requireSubscription: billing.requireSubscription, push: deps.push });
    app.register(billingRoutes, { prisma, authenticate, ...billing });
    app.register(referralRoutes, { prisma, authenticate, now: deps.now, publicUrl: deps.invites?.publicUrl });
    app.register(referralPageRoutes, { prisma, storeUrl: deps.invites?.storeUrl });
    app.register(circleRoutes, { prisma, authenticate, now: deps.now, requireSubscription: billing.requireSubscription, publicUrl: deps.invites?.publicUrl, push: deps.push });
    app.register(invitePageRoutes, { prisma, now: deps.now, storeUrl: deps.invites?.storeUrl });
    app.register(daftarRoutes, { prisma, authenticate, now: deps.now, publicUrl: deps.invites?.publicUrl });
    app.register(daftarPageRoutes, { prisma, now: deps.now, storeUrl: deps.invites?.storeUrl });
    app.register(taskRoutes, { prisma, authenticate, now: deps.now, requireSubscription: billing.requireSubscription, push: deps.push });
    app.register(trackerRoutes, { prisma, authenticate, now: deps.now });
    app.register(feedRoutes, { prisma, authenticate, now: deps.now, push: deps.push, requireSubscription: billing.requireSubscription });
    app.register(moneyRoutes, { prisma, authenticate, now: deps.now, push: deps.push });
    app.register(sessionRoutes, { prisma, authenticate, now: deps.now, model: deps.model, enabled: deps.sessionEnabled });
    app.register(itemRoutes, { prisma, authenticate, now: deps.now, push: deps.push });
    app.register(deviceRoutes, { prisma, authenticate });
    app.register(eventRoutes, { prisma, authenticate, now: deps.now });
    app.register(splitRoutes, { prisma, authenticate, publicUrl: deps.invites?.publicUrl });
    app.register(splitPageRoutes, { prisma, publicUrl: deps.invites?.publicUrl, storeUrl: deps.invites?.storeUrl });
    app.register(cardRoutes, { prisma, publicUrl: deps.invites?.publicUrl });
    app.register(photoRoutes, { prisma, authenticate, model: deps.model, now: deps.now, requireSubscription: billing.requireSubscription });
    app.register(meRoutes, { prisma, auth, authenticate, deleteAuthUser: deps.deleteAuthUser });
    app.register(bootstrapRoutes, { authenticate });
    if (deps.adminPassword) app.register(adminRoutes, { prisma, password: deps.adminPassword, metrics, now: deps.now });
  }

  return app;
}
