import { buildApp, LOG_REDACT } from "./app";
import { db } from "./db";
import { loadEnv } from "./env";

const env = loadEnv();
const prisma = env.DATABASE_URL ? db() : undefined;
const app = buildApp({ logger: { level: env.LOG_LEVEL, redact: LOG_REDACT } }, { prisma });
if (!prisma) app.log.warn("DATABASE_URL not set: only /health is served");

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "shutting down");
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
