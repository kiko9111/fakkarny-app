import { createAnthropicModel } from "./ai/model";
import { buildApp, LOG_REDACT } from "./app";
import { startJobs } from "./jobs";
import { createConversationPipeline } from "./pipeline/conversation";
import { createExpoPushSender, createExpoReceiptChecker } from "./proactive/push";
import { trackPush } from "./proactive/push-receipts";
import { db } from "./db";
import { loadEnv } from "./env";
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

const boss =
  prisma && env.DATABASE_URL && env.DISABLE_JOBS !== "1"
    ? await startJobs(env.DATABASE_URL, {
        prisma,
        model,
        push,
        receipts: createExpoReceiptChecker(fetch, env.EXPO_ACCESS_TOKEN),
        log: app.log,
        requireSubscription: env.REQUIRE_SUBSCRIPTION === "1",
      })
    : undefined;

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "shutting down");
  await boss?.stop();
  await app.close();
  await prisma?.$disconnect();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ port: env.PORT, host: env.HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
