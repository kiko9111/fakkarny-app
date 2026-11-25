import type { FastifyBaseLogger } from "fastify";
import { PgBoss } from "pg-boss";
import { runTick, type TickDeps } from "../proactive/tick";
import { checkPushReceipts } from "../proactive/push-receipts";
import type { ReceiptChecker } from "../proactive/push";

/**
 * "exclusive" queues hold at most one job, queued or running: a tick that runs long makes the
 * next minute's job be dropped instead of piling up or running alongside it. The name moved
 * from "proactive-tick" because a queue's policy is fixed when it is created.
 */
export const PROACTIVE_QUEUE = "proactive-tick-2";
const OLD_PROACTIVE_QUEUE = "proactive-tick";
export const HOUSEKEEPING_QUEUE = "housekeeping";

/**
 * pg-boss on the same Postgres (no Redis): a cron job every minute decides and sends
 * briefs, check-ins and follow-ups (PRD §6 "Jobs"), and one every 10 minutes cleans up
 * (expired homework photos, push receipts). Several API instances are fine: pg-boss runs
 * each job once and the tick claims users with SKIP LOCKED.
 */
export async function startJobs(connectionString: string, deps: TickDeps & { log: FastifyBaseLogger; receipts?: ReceiptChecker }) {
  // deps.requireSubscription keeps locked chats quiet (FR-9).
  // Few connections: the session pooler's limit is shared with the API's own pool (db.ts).
  const boss = new PgBoss({ connectionString, max: Number(process.env["PGBOSS_POOL_MAX"] ?? 3) });
  boss.on("error", (err) => deps.log.error({ err: err.name }, "pg-boss error"));
  await boss.start();
  await boss.unschedule(OLD_PROACTIVE_QUEUE).catch(() => {});

  await boss.createQueue(PROACTIVE_QUEUE, { policy: "exclusive", retryLimit: 0, expireInSeconds: 120 });
  await boss.schedule(PROACTIVE_QUEUE, "* * * * *");
  await boss.work(PROACTIVE_QUEUE, async () => {
    const sent = await runTick(deps);
    if (sent) deps.log.info({ sent }, "proactive messages sent");
  });

  await boss.createQueue(HOUSEKEEPING_QUEUE, { policy: "exclusive", retryLimit: 0, expireInSeconds: 300 });
  await boss.schedule(HOUSEKEEPING_QUEUE, "*/10 * * * *");
  await boss.work(HOUSEKEEPING_QUEUE, async () => {
    const now = new Date();
    // Homework photos are kept 90 days (owner decision, 2026-11-23).
    await deps.prisma.photo.deleteMany({ where: { expiresAt: { lt: now } } }).catch(() => {});
    if (deps.receipts) {
      const cleared = await checkPushReceipts(deps.prisma, deps.receipts, now).catch((err: Error) => (deps.log.warn({ err: err.name }, "push receipts failed"), 0));
      if (cleared) deps.log.info({ cleared }, "dead push tokens cleared");
    }
  });
  return boss;
}
