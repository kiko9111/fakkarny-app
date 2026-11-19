import { createAnthropicModel } from "./ai/model";
import { buildApp, LOG_REDACT } from "./app";
import { startJobs } from "./jobs";
import { createConversationPipeline } from "./pipeline/conversation";
import { createExpoPushSender } from "./proactive/push";
import { db } from "./db";
import { loadEnv } from "./env";

const env = loadEnv();
const prisma = env.DATABASE_URL ? db() : undefined;
const model = env.ANTHROPIC_API_KEY ? createAnthropicModel({ apiKey: env.ANTHROPIC_API_KEY }) : undefined;
const supabaseUrl = env.SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const app = buildApp(
  { logger: { level: env.LOG_LEVEL, redact: LOG_REDACT } },
  {
    prisma,
    pipelineFactory: model ? (log) => createConversationPipeline({ model, log }) : undefined,
    auth: { supabaseUrl, supabaseJwtSecret: env.SUPABASE_JWT_SECRET, allowInstallId: env.ALLOW_INSTALL_ID === "1" },
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
    ? await startJobs(env.DATABASE_URL, { prisma, model, push: createExpoPushSender(fetch, env.EXPO_ACCESS_TOKEN), log: app.log })
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
