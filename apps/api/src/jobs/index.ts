import type { FastifyBaseLogger } from "fastify";
import { PgBoss } from "pg-boss";
import { runTick, type TickDeps } from "../proactive/tick";

export const PROACTIVE_QUEUE = "proactive-tick";

/**
 * pg-boss on the same Postgres (no Redis): a cron job every minute decides and sends
 * briefs, check-ins and follow-ups (PRD §6 "Jobs"). Run one API instance with jobs on,
 * or several: pg-boss makes sure each tick runs once.
 */
export async function startJobs(connectionString: string, deps: TickDeps & { log: FastifyBaseLogger }) {
  // deps.requireSubscription keeps locked chats quiet (FR-9).
  const boss = new PgBoss(connectionString);
  boss.on("error", (err) => deps.log.error({ err: err.name }, "pg-boss error"));
  await boss.start();
  await boss.createQueue(PROACTIVE_QUEUE);
  await boss.schedule(PROACTIVE_QUEUE, "* * * * *");
  await boss.work(PROACTIVE_QUEUE, async () => {
    const sent = await runTick(deps);
    if (sent) deps.log.info({ sent }, "proactive messages sent");
  });
  return boss;
}
