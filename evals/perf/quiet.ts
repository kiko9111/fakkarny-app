/**
 * What a burst of lookups costs after a quiet pause (speed thread, 2026-11-26).
 *
 * The API's database pool lets a connection go once it has been idle for a while, and opening
 * one again is several round trips to a far database. One person using the app leaves the
 * server quiet for half a minute all the time. This runs the real app in this process against
 * a local Postgres through the delay proxy, with the server's own pool
 * (apps/api/src/db-pool.ts), lets it sit quiet, and times the same request after the quiet and
 * then right after that.
 *
 *   npm run perf:quiet -w @fakkarni/evals -- [--rtt 100] [--quiet 35000] [--idle <ms>]
 *
 * --quiet is how long the server sits idle before each timed request, in ms. --idle sets the
 * pool's idle timeout for this run; without it the pool has the server's setting. The pool
 * before 2026-11-26 is `--idle 30000`. A local connection has no TLS, so opening one is about
 * 3 round trips here and about 5 on the live server: the live cost is larger than this shows.
 * Same database rule as the speed harness: PERF_DATABASE_URL must name a database with "perf"
 * in it.
 */
import { randomUUID } from "node:crypto";
import { startDelayProxy } from "./proxy";

const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const RTT = Number(arg("--rtt") ?? 100);
const QUIET = Number(arg("--quiet") ?? 35_000);
const IDLE = arg("--idle") === undefined ? undefined : Number(arg("--idle"));
const PERF_DB = process.env["PERF_DATABASE_URL"] ?? "postgresql://postgres:postgres@localhost:5432/fakkarni_perf";
if (!/perf/.test(new URL(PERF_DB).pathname)) throw new Error("PERF_DATABASE_URL must name a database with 'perf' in it: this empties every table.");

const target = new URL(PERF_DB);
const proxy = await startDelayProxy({ host: target.hostname, port: Number(target.port || 5432) });
const proxied = new URL(PERF_DB);
proxied.hostname = "127.0.0.1";
proxied.port = String(proxy.port);
process.env["DATABASE_URL"] = proxied.toString();
process.env["DISABLE_JOBS"] = "1";

const { buildApp } = await import("../../apps/api/src/app");
const { PrismaClient } = await import("../../apps/api/src/generated/prisma/client");
const { openPool, poolSettings } = await import("../../apps/api/src/db-pool");
const { PrismaPg } = await import("@prisma/adapter-pg");
const { createConversationPipeline } = await import("../../apps/api/src/pipeline/conversation");
type FriendModel = import("../../apps/api/src/ai/model").FriendModel;
type FriendModelResult = import("../../apps/api/src/ai/model").FriendModelResult;

const usage = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 3000, cache_creation_input_tokens: 0 };
const model: FriendModel = {
  async respond() {
    return { ok: true, usage, output: { create_items: [], update_items: [], save_memories: [], crisis: false, reply: ["تمام 💛"] } } as FriendModelResult;
  },
  async complete() {
    return { text: "ملخص", usage };
  },
};

const pool = openPool(process.env["DATABASE_URL"]!, IDLE === undefined ? {} : { idleTimeoutMillis: IDLE });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool, { disposeExternalPool: true }) });
const app = buildApp({ logger: false }, { prisma, model, rateLimitPerMinute: false, userCacheMs: 15_000, pipelineFactory: (log) => createConversationPipeline({ model, log }), auth: { allowInstallId: true }, billing: { requireSubscription: false } });
await app.ready();
await prisma.$executeRawUnsafe('TRUNCATE TABLE "users", "circles" CASCADE');

const id = randomUUID();
const call = (method: "GET" | "POST" | "PATCH", url: string, payload?: object) => app.inject({ method, url, headers: { "x-install-id": id, "x-message-kinds": "2" }, ...(payload ? { payload } : {}) });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// One person with a little of everything, so the screens have rows to read.
await call("GET", "/me");
await call("PATCH", "/me", { name: "Mona", timezone: "Africa/Cairo", language: "ar-EG" });
const circle = JSON.parse((await call("POST", "/circles", { kind: "family", name: "البيت", family_type: "parents_teens" })).body).circle;
await call("POST", `/circles/${circle.id}/checkins`, { kind: "home" });
await call("POST", "/trackers", { kind: "water" });
await call("POST", "/money/sections", { id: randomUUID(), name: "أكل", kind: "expense", budget: 4000 });
await call("POST", "/daftar", { other_name: "أم أحمد", direction: "owed_to_me", amount: 75 });

const say = () => call("POST", "/messages", { client_id: randomUUID(), text: "عامل ايه النهارده", created_at: new Date().toISOString(), timezone: "Africa/Cairo" });
const timed = async (what: string, run: () => Promise<{ statusCode: number }>) => {
  const open = pool.totalCount;
  proxy.reset();
  const t = performance.now();
  const res = await run();
  console.log(`${what.padEnd(52)} ${String(Math.round(performance.now() - t)).padStart(5)} ms  ${String(proxy.roundTrips()).padStart(3)} trips  ${String(open).padStart(2)} open before  ${res.statusCode}`);
};

proxy.setDelay(RTT / 2);
const idle = pool.options.idleTimeoutMillis ?? poolSettings().idleTimeoutMillis;
console.log(`\nround trip ${RTT} ms; the pool lets a connection go after ${idle} ms idle; each request is timed after ${QUIET} quiet ms, then again right after\n`);
for (const [name, run] of [
  ["every tab in one answer (GET /bootstrap)", () => call("GET", "/bootstrap")],
  ["one tab (GET /circles)", () => call("GET", "/circles")],
  ["a chat turn (stand-in model)", say],
] as const) {
  await run(); // whatever a first call does once
  await sleep(QUIET);
  await timed(`${name}, after the quiet`, run);
  await timed(`${name}, right after`, run);
}

await app.close();
await prisma.$disconnect();
await proxy.close();
process.exit(0);
