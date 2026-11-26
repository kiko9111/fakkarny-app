import { createAnthropicModel } from "./ai/model";
import { buildApp, LOG_REDACT } from "./app";
import { startJobs } from "./jobs";
import { createConversationPipeline } from "./pipeline/conversation";
import { createExpoPushSender, createExpoReceiptChecker } from "./proactive/push";
import { trackPush } from "./proactive/push-receipts";
import { db } from "./db";
import { loadEnv } from "./env";
import { backgroundSettled } from "./lib/background";
import { initSentry } from "./observability/sentry";

const env = loadEnv();
const sentry = initSentry(env.SENTRY_DSN, env.NODE_ENV);
const prisma = env.DATABASE_URL ? db() : undefined;
const model = env.ANTHROPIC_API_KEY ? createAnthropicModel({ apiKey: env.ANTHROPIC_API_KEY }) : undefined;
const supabaseUrl = env.SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const expoPush = createExpoPushSender(fetch, env.EXPO_ACCESS_TOKEN);
// Every push goes through trackPush, so dead tokens are cleared wherever a push is sent.
const push = prisma ? trackPush(prisma, expoPush) : expoPush;
const app = buildApp(
  // Behind the host's proxy (Railway): take the caller's IP and protocol from its headers,
  // so the public invite page is rate-limited per visitor and invite links are https.
  { logger: { level: env.LOG_LEVEL, redact: LOG_REDACT }, trustProxy: true },
  {
    prisma,
    push,
    model,
    userCacheMs: env.USER_CACHE_MS,
    liveReplies: model ? () => model.streams === true : undefined,
    sessionEnabled: env.SESSION_ENABLED === "1" && Boolean(model),
    pipelineFactory: model ? (log) => createConversationPipeline({ model, log }) : undefined,
    auth: { supabaseUrl, supabaseJwtSecret: env.SUPABASE_JWT_SECRET, allowInstallId: env.ALLOW_INSTALL_ID === "1" },
    adminPassword: env.ADMIN_PASSWORD,
    legal: { operator: env.LEGAL_OPERATOR, contactEmail: env.LEGAL_CONTACT_EMAIL, reviewed: env.LEGAL_REVIEWED === "1" },
    sentry,
    invites: { publicUrl: env.PUBLIC_URL, storeUrl: env.ANDROID_STORE_URL },
    billing: {
      requireSubscription: env.REQUIRE_SUBSCRIPTION === "1",
      webhookAuth: env.REVENUECAT_WEBHOOK_AUTH,
      revenueCatSecretKey: env.REVENUECAT_SECRET_KEY,
    },
    deleteAuthUser:
      supabaseUrl && serviceKey
        ? async (sub) => {
            const res = await fetch(new URL(`/auth/v1/admin/users/${sub}`, supabaseUrl), {
              method: "DELETE",
              headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
            });
            if (!res.ok && res.status !== 404) throw new Error(`Supabase delete failed: ${res.status}`);
          }
        : undefined,
  },
);
if (!supabaseUrl && !env.SUPABASE_JWT_SECRET) app.log.warn("Supabase not configured: only install-ID identity is accepted");
if (!prisma) app.log.warn("DATABASE_URL not set: only /health is served");
if (!model) app.log.warn("ANTHROPIC_API_KEY not set: messages are stored but the friend won't reply");

// A deploy tells the old server to stop (SIGTERM) once the new one answers, and kills it when
// its drain ends (railway.json: 60 s). The container starts this file as its first process
// (Dockerfile), so the signal arrives here. A first process with no handler drops the signal,
// so the handlers go in before the first wait (pg-boss's start, the listen).
const STOP = {
  /** Connections still busy this long after the signal are closed (a phone resends its message). */
  closeAllAfterMs: 40_000,
  /** pg-boss's wait for a running job (the proactive tick) to end. */
  jobsMs: 20_000,
  /** The wait for pushes and dashboard rows the last requests started. */
  backgroundMs: 5_000,
  /** If anything still hangs, the process ends anyway, before the platform kills it. */
  giveUpAfterMs: 55_000,
};
let boss: Awaited<ReturnType<typeof startJobs>> | undefined;
let starting: Promise<unknown> = Promise.resolve();
let stopping = false;
const shutdown = async (signal: string) => {
  if (stopping) return;
  stopping = true;
  app.log.info({ signal }, "shutting down");
  setTimeout(() => process.exit(1), STOP.giveUpAfterMs).unref();
  try {
    await starting.catch(() => {});
    // No new connections; the replies in flight finish. Node's close() only closes the
    // connections that are idle at that moment, and a reply that ends later leaves its
    // keep-alive connection open until the caller closes it (up to Fastify's 72 s): close each
    // one as soon as it is idle, streamed replies included, and every one that is left after
    // closeAllAfterMs.
    const closing = app.close();
    const sweep = setInterval(() => app.server.closeIdleConnections(), 250);
    const cutoff = setTimeout(() => app.server.closeAllConnections(), STOP.closeAllAfterMs);
    await Promise.all([closing.finally(() => (clearInterval(sweep), clearTimeout(cutoff))), boss?.stop({ timeout: STOP.jobsMs })]);
    await backgroundSettled(STOP.backgroundMs);
    await prisma?.$disconnect();
    process.exit(0);
  } catch (err) {
    app.log.error({ err: err instanceof Error ? err.name : "unknown" }, "shutdown failed");
    process.exit(1);
  }
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

starting = (async () => {
  if (prisma && env.DATABASE_URL && env.DISABLE_JOBS !== "1") {
    boss = await startJobs(env.DATABASE_URL, {
      prisma,
      model,
      push,
      receipts: createExpoReceiptChecker(fetch, env.EXPO_ACCESS_TOKEN),
      log: app.log,
      requireSubscription: env.REQUIRE_SUBSCRIPTION === "1",
    });
  }
  // A signal during the start: stop instead of opening the port.
  if (!stopping) await app.listen({ port: env.PORT, host: env.HOST });
})();

try {
  await starting;
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
