import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { type AddressInfo, createServer } from "node:net";
import { INSTALL_ID_HEADER } from "@fakkarni/shared";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasTestDb, TEST_DATABASE_URL } from "../test/db";
import type { FriendModel, FriendModelResult } from "./ai/model";
import { buildApp } from "./app";
import { isNoRoom, openPool, PatientPool, poolSettings } from "./db-pool";
import { PrismaClient } from "./generated/prisma/client";
import { createConversationPipeline } from "./pipeline/conversation";
import { BOOTSTRAP_BASE } from "./routes/bootstrap";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const FULL = "(EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15";

/** A stand-in server with a fixed number of places, and the client class that connects to it. */
function standIn(places: number) {
  const server = { places, open: 0, most: 0, attempts: 0, refused: 0, failWith: null as Error | null, lateError: false };
  class Client extends EventEmitter {
    _queryable = true;
    _ending = false;
    #in = false;
    connect(cb: (err?: Error) => void) {
      server.attempts++;
      setTimeout(() => {
        if (server.failWith) return cb(server.failWith);
        if (server.open >= server.places) {
          server.refused++;
          if (server.lateError) setTimeout(() => this.emit("error", new Error("Connection terminated unexpectedly")), 1);
          return cb(Object.assign(new Error(FULL), { code: "XX000", severity: "FATAL" }));
        }
        this.#in = true;
        server.most = Math.max(server.most, ++server.open);
        cb();
      }, 5);
    }
    query(_text: unknown, _values: unknown, cb: (err: Error | undefined, res?: unknown) => void) {
      setTimeout(() => cb(undefined, { rows: [] }), 5);
    }
    end(cb?: () => void) {
      if (this.#in) server.open--;
      this.#in = false;
      this._ending = true;
      cb?.();
    }
    isConnected() {
      return this.#in;
    }
  }
  const pool = (patience: ConstructorParameters<typeof PatientPool>[1] = {}) => new PatientPool({ Client, max: 8, idleTimeoutMillis: 60_000, connectionTimeoutMillis: 2_000 } as unknown as pg.PoolConfig, patience);
  return { server, pool };
}
const burst = (pool: pg.Pool, n: number) => Promise.all(Array.from({ length: n }, () => pool.query("select 1")));

describe("the pool's settings", () => {
  it("keeps a connection five minutes, with a sign of life, under the pooler's limit", () => {
    expect(poolSettings({})).toEqual({ max: 8, idleTimeoutMillis: 300_000, connectionTimeoutMillis: 15_000, keepAlive: true, keepAliveInitialDelayMillis: 10_000 });
  });

  it("takes its size and its idle time from the environment, and ignores what is not a number above zero", () => {
    expect(poolSettings({ DB_POOL_MAX: "5", DB_POOL_IDLE_MS: "60000" })).toMatchObject({ max: 5, idleTimeoutMillis: 60_000 });
    expect(poolSettings({ DB_POOL_MAX: "", DB_POOL_IDLE_MS: "soon" })).toMatchObject({ max: 8, idleTimeoutMillis: 300_000 });
    expect(poolSettings({ DB_POOL_MAX: "0", DB_POOL_IDLE_MS: "-1" })).toMatchObject({ max: 8, idleTimeoutMillis: 300_000 });
    // Past what Node's timers hold (2^31-1 ms) a timer fires at once: kept as long as they allow.
    expect(poolSettings({ DB_POOL_IDLE_MS: "2592000000" })).toMatchObject({ idleTimeoutMillis: 2_147_483_647 });
  });
});

describe("no room", () => {
  it("is what Postgres, Supabase's pooler and PgBouncer say when they are full", () => {
    for (const [message, code] of [
      ["sorry, too many clients already", "53300"],
      ['too many connections for role "app"', "53300"],
      ["remaining connection slots are reserved for roles with the SUPERUSER attribute", "53300"],
      ["something new that Postgres says under the same code", "53300"],
      [FULL, "XX000"],
      ["MaxClientsInSessionMode: max clients reached - in Session mode max clients are limited to pool_size", "XX000"],
      ["max client connections reached", "XX000"],
      ["no more connections allowed (max_client_conn)", "08P01"],
    ]) {
      expect(isNoRoom(Object.assign(new Error(message), { code })), message).toBe(true);
    }
  });

  it("is not a refused port, a wrong password, a full queue or nothing at all", () => {
    for (const err of [
      Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" }),
      Object.assign(new Error('password authentication failed for user "app"'), { code: "28P01" }),
      new Error("timeout exceeded when trying to connect"),
      new Error("Connection terminated unexpectedly"),
      null,
      undefined,
      "max clients reached",
    ]) {
      expect(isNoRoom(err)).toBe(false);
    }
  });
});

describe("a pool that waits its turn", () => {
  it("with room, opens a connection for every query at once, up to its size", async () => {
    const { server, pool: make } = standIn(20);
    const pool = make();
    await burst(pool, 12);
    expect(server.most).toBe(8);
    expect(server.refused).toBe(0);
    expect(pool.room).toBe(8);
    await pool.end();
    expect(server.open).toBe(0);
  });

  it("answers a burst wider than the server's room in full, on the connections it has", async () => {
    const { server, pool: make } = standIn(2);
    const seen: number[] = [];
    const pool = make({ regrowMs: 60_000, onNoRoom: ({ open }) => seen.push(open) });
    await burst(pool, 12);
    expect(server.most).toBe(2);
    // Eight attempts at once, two let in. The first refusal lets pg start one more for the
    // next query in its queue; from then on the pool is "full" at two and no attempt follows.
    expect(server.attempts).toBe(9);
    expect(server.refused).toBe(7);
    expect(pool.room).toBe(2);
    expect(pool.totalCount).toBe(2);
    expect(seen).toHaveLength(7);
    expect(seen.at(-1)).toBe(2);
    // The next bursts queue on those two: nothing is refused, because nothing is tried.
    await burst(pool, 12);
    await burst(pool, 3);
    expect(server.attempts).toBe(9);
    await pool.end();
  });

  it("tries again after a while, with one connection and not a burst of them", async () => {
    const { server, pool: make } = standIn(2);
    const pool = make({ regrowMs: 40 });
    await burst(pool, 12);
    await sleep(60);
    const before = server.attempts;
    await burst(pool, 12);
    // One attempt for the try, and the one pg starts for the next query in its queue when it fails.
    expect(server.attempts - before).toBeLessThanOrEqual(2);
    expect(server.attempts - before).toBeGreaterThanOrEqual(1);
    expect(server.most).toBe(2);
    await pool.end();
  });

  it("grows to its size again once the server has room", async () => {
    const { server, pool: make } = standIn(2);
    const pool = make({ regrowMs: 40 });
    await burst(pool, 12);
    expect(pool.totalCount).toBe(2);
    server.places = 20;
    await sleep(60);
    await burst(pool, 12); // the one try is let in: the limit is lifted
    expect(pool.room).toBe(8);
    await burst(pool, 12);
    expect(server.most).toBe(8);
    expect(pool.totalCount).toBe(8);
    await pool.end();
  });

  it("once there is room again, opens connections for the queries that were waiting, not only for new ones", async () => {
    const { server, pool: make } = standIn(2);
    const pool = make({ regrowMs: 40 });
    await burst(pool, 12);
    expect(pool.room).toBe(2);
    server.places = 20;
    await sleep(60);
    server.most = server.open;
    // The burst queues on the two connections; the one try is let in and lifts the limit, and
    // the queries still waiting get connections of their own instead of waiting for the three.
    await burst(pool, 12);
    expect(pool.room).toBe(8);
    expect(server.most).toBe(8);
    await pool.end();
  });

  it("counts the connections it was given: a refused attempt that reports an error afterwards changes nothing", async () => {
    const { server, pool: make } = standIn(2);
    server.lateError = true;
    const seen: number[] = [];
    const pool = make({ regrowMs: 60_000, onNoRoom: ({ open }) => seen.push(open) });
    pool.on("error", () => {});
    await burst(pool, 12);
    // pg drops a client that reports an error and says "removed", also one that never got in.
    // Six of those were dropped before the last refusal: the pool still knew it had two.
    expect(server.refused).toBe(7);
    expect(seen.at(-1)).toBe(2);
    expect(pool.room).toBe(2);
    expect(pool.totalCount).toBe(2);
    await pool.end();
  });

  it("with no connection at all, keeps trying one at a time, then gives up with the server's own words", async () => {
    const { server, pool: make } = standIn(0);
    const pool = make({ patienceMs: 300, regrowMs: 60_000 });
    const started = Date.now();
    const results = await Promise.allSettled([pool.query("select 1"), pool.query("select 1"), pool.query("select 1")]);
    const took = Date.now() - started;
    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected", "rejected"]);
    expect((results[0] as PromiseRejectedResult).reason.message).toBe(FULL);
    expect(took).toBeGreaterThanOrEqual(300);
    expect(took).toBeLessThan(2_000);
    expect(server.attempts).toBeGreaterThan(3);
    expect(server.most).toBe(0);
    // A place comes free: the next query gets it.
    server.places = 1;
    await pool.query("select 1");
    expect(pool.room).toBe(8);
    await pool.end();
  });

  it("passes any other failure to connect on at once, and stays at its size", async () => {
    const { server, pool: make } = standIn(20);
    const pool = make();
    server.failWith = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" });
    const started = Date.now();
    await expect(pool.query("select 1")).rejects.toThrow("ECONNREFUSED");
    expect(Date.now() - started).toBeLessThan(80);
    expect(server.attempts).toBe(1);
    expect(pool.room).toBe(8);
    await pool.end();
  });

  it("hands out a client to hold (a transaction) and takes the callback form, as pg's pool does", async () => {
    const { server, pool: make } = standIn(1);
    const pool = make({ regrowMs: 60_000 });
    const held = await pool.connect();
    // The only place is taken: a second query is refused once, then waits for that connection.
    const waiting = pool.query("select 1");
    await sleep(30);
    expect(server.refused).toBe(1);
    held.release();
    await waiting;
    const viaCallback = await new Promise<boolean>((resolve, reject) => {
      pool.connect((err, client, done) => {
        if (err || !client) return reject(err);
        done();
        resolve(true);
      });
    });
    expect(viaCallback).toBe(true);
    expect(server.most).toBe(1);
    await pool.end();
    await expect(pool.connect()).rejects.toThrow("Cannot use a pool after calling end on the pool");
  });
});

/**
 * A stand-in Postgres on a real socket that ends a session the way a restart or a failover does:
 * FATAL 57P01, read together with what came just before it (the end of a query, or of the start).
 */
async function endingServer(when: "after-answer" | "after-start") {
  const msg = (type: string, body: Buffer) => {
    const out = Buffer.alloc(5 + body.length);
    out.write(type, 0, "latin1");
    out.writeInt32BE(4 + body.length, 1);
    body.copy(out, 5);
    return out;
  };
  const int32 = (n: number) => {
    const out = Buffer.alloc(4);
    out.writeInt32BE(n);
    return out;
  };
  const text = (s: string) => Buffer.concat([Buffer.from(s), Buffer.from([0])]);
  const ready = msg("Z", Buffer.from("I"));
  const start = Buffer.concat([msg("R", int32(0)), msg("K", Buffer.concat([int32(7), int32(8)])), ready]);
  const fatal = msg("E", Buffer.concat([Buffer.from("S"), text("FATAL"), Buffer.from("C"), text("57P01"), Buffer.from("M"), text("terminating connection due to administrator command"), Buffer.from([0])]));
  const server = createServer((socket) => {
    let started = false;
    socket.on("error", () => {});
    socket.on("data", (chunk: Buffer) => {
      if (!started) {
        started = true;
        socket.write(when === "after-start" ? Buffer.concat([start, fatal]) : start);
        if (when === "after-start") setTimeout(() => socket.destroy(), 20);
        return;
      }
      if (chunk[0] !== 0x51) return; // "Q": a query
      setTimeout(() => {
        socket.write(Buffer.concat([msg("C", text("SELECT 0")), ready, fatal]));
        setTimeout(() => socket.destroy(), 20);
      }, 20);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `postgresql://zaki:test@127.0.0.1:${(server.address() as AddressInfo).port}/zaki`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe("a session the server ends (a restart, a failover)", () => {
  // pg hands a connection to the next query from inside the read that ended the last one. If
  // the query's 'error' listener is not on the connection by the time the FATAL in that same
  // read is parsed, the error is thrown out of the socket's handler and the process stops.
  const thrown: Error[] = [];
  const onThrown = (err: Error) => thrown.push(err);

  it("fails the query that was waiting for the connection, and nothing is thrown", async () => {
    const server = await endingServer("after-answer");
    process.on("uncaughtException", onThrown);
    const pool = openPool(server.url, { max: 1 });
    try {
      const first = pool.query("select 1");
      const second = pool.query("select 2");
      await expect(first).resolves.toBeDefined();
      await expect(second).rejects.toThrow("terminating connection due to administrator command");
      await sleep(50);
      expect(thrown).toEqual([]);
    } finally {
      process.off("uncaughtException", onThrown);
      await pool.end().catch(() => {});
      await server.close();
    }
  });

  it("fails the query of a connection ended right after it opened, and nothing is thrown", async () => {
    const server = await endingServer("after-start");
    process.on("uncaughtException", onThrown);
    const pool = openPool(server.url);
    try {
      await expect(pool.query("select 1")).rejects.toThrow("terminating connection due to administrator command");
      await sleep(50);
      expect(thrown).toEqual([]);
    } finally {
      process.off("uncaughtException", onThrown);
      await pool.end().catch(() => {});
      await server.close();
    }
  });
});

describe.skipIf(!hasTestDb)("the pool on a real Postgres", () => {
  // A role that may hold two connections stands in for a pooler with two places left.
  const ROLE = "zaki_pool_room_test";
  let admin: pg.Pool;
  let limitedUrl = "";
  let canMakeRoles = true;

  // What the role was given goes first, or Postgres will not drop it (also after a run that was cut short).
  const dropRole = `DO $$ BEGIN IF EXISTS (SELECT FROM pg_roles WHERE rolname = '${ROLE}') THEN EXECUTE 'DROP OWNED BY ${ROLE}'; EXECUTE 'DROP ROLE ${ROLE}'; END IF; END $$`;

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: TEST_DATABASE_URL!, max: 1 });
    try {
      await admin.query(dropRole);
      // Every table has row level security with no policy (the API connects as the owner): BYPASSRLS.
      await admin.query(`CREATE ROLE ${ROLE} LOGIN PASSWORD 'room' CONNECTION LIMIT 2 BYPASSRLS`);
      await admin.query(`GRANT ALL ON ALL TABLES IN SCHEMA public TO ${ROLE}`);
      await admin.query(`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ${ROLE}`);
      const url = new URL(TEST_DATABASE_URL!);
      url.username = ROLE;
      url.password = "room";
      limitedUrl = url.toString();
    } catch {
      canMakeRoles = false; // the test database's user may not create roles: the role tests are skipped
    }
  });

  afterAll(async () => {
    if (canMakeRoles) await admin.query(dropRole).catch(() => {});
    await admin.end();
  });

  it("recognises a real server's refusal (a plain pool fails the queries that found no room)", async ({ skip }) => {
    if (!canMakeRoles) skip();
    const plain = new pg.Pool({ connectionString: limitedUrl, max: 6 });
    plain.on("error", () => {});
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => plain.query("select pg_sleep(0.2)")));
    await plain.end();
    const refused = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(refused.length).toBeGreaterThanOrEqual(4);
    for (const r of refused) expect(isNoRoom(r.reason), String(r.reason?.message)).toBe(true);
  });

  it("answers the same burst in full on the two connections the server allows", async ({ skip }) => {
    if (!canMakeRoles) skip();
    const pool = openPool(limitedUrl, { max: 6 }, { regrowMs: 60_000 });
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => pool.query("select pg_sleep(0.05), $1::int as n", [i])));
    expect(results.map((r) => r.rows[0].n)).toEqual(Array.from({ length: 12 }, (_, i) => i));
    expect(pool.totalCount).toBe(2);
    expect(pool.room).toBe(2);
    await pool.end();
  });

  it("runs the whole app on those two connections: every tab in one answer, and a chat turn", async ({ skip }) => {
    if (!canMakeRoles) skip();
    // The server's own numbers: it would open eight at once if the database let it.
    const pool = openPool(limitedUrl, {}, { regrowMs: 60_000 });
    const prisma = new PrismaClient({ adapter: new PrismaPg(pool, { disposeExternalPool: true }) });
    const usage = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 3000, cache_creation_input_tokens: 0 };
    const model: FriendModel = {
      async respond() {
        return { ok: true, usage, output: { create_items: [], update_items: [], save_memories: [], crisis: false, reply: ["تمام 💛"] } } as FriendModelResult;
      },
      async complete() {
        return { text: "ملخص", usage };
      },
    };
    const app = buildApp({ logger: false }, { prisma, model, rateLimitPerMinute: false, pipelineFactory: (log) => createConversationPipeline({ model, log }), auth: { allowInstallId: true }, billing: { requireSubscription: false } });
    const who = randomUUID();
    const call = (method: "GET" | "POST", url: string, payload?: object) => app.inject({ method, url, headers: { [INSTALL_ID_HEADER]: who, "x-message-kinds": "2" }, ...(payload ? { payload } : {}) });
    try {
      expect((await call("GET", "/me")).statusCode).toBe(200);
      const circle = (await call("POST", "/circles", { kind: "family", name: "البيت" })).json().circle;
      expect((await call("POST", "/trackers", { kind: "water" })).statusCode).toBe(201);

      const all = await call("GET", "/bootstrap");
      expect(all.statusCode).toBe(200);
      const parts = all.json().parts as Record<string, string | null>;
      const paths = [...BOOTSTRAP_BASE, `/circles/${circle.id}`, `/circles/${circle.id}/feed`, `/circles/${circle.id}/trackers`];
      expect(Object.keys(parts).sort()).toEqual([...paths].sort());
      for (const path of paths) expect(typeof parts[path], path).toBe("string");

      const said = await call("POST", "/messages", { client_id: randomUUID(), text: "عامل ايه النهارده", created_at: new Date().toISOString(), timezone: "Africa/Cairo" });
      expect(said.statusCode).toBe(201);
      expect(said.json().replies).toHaveLength(1);

      // Several people at once, each a burst of lookups of their own.
      const many = await Promise.all(Array.from({ length: 4 }, () => call("GET", "/bootstrap")));
      expect(many.map((r) => r.statusCode)).toEqual([200, 200, 200, 200]);

      expect(pool.totalCount).toBe(2);
      expect(pool.room).toBe(2);
    } finally {
      await app.close();
      await prisma.$disconnect();
      await admin.query('TRUNCATE TABLE "users", "circles" CASCADE');
    }
  });

  it("is the pool Prisma runs on, and Prisma closes it", async () => {
    const pool = openPool(TEST_DATABASE_URL!, { max: 3, idleTimeoutMillis: 10_000 });
    const prisma = new PrismaClient({ adapter: new PrismaPg(pool, { disposeExternalPool: true }) });
    expect(pool.totalCount).toBe(0);
    const [one] = await prisma.$queryRaw<{ n: number }[]>`select 1::int as n`;
    expect(one?.n).toBe(1);
    // The adapter took this pool (it tells by `instanceof pg.Pool`: one copy of pg in the tree).
    expect(pool.totalCount).toBe(1);
    // A transaction holds one client; queries beside it use the others.
    const [users, two] = await Promise.all([prisma.$transaction([prisma.user.count(), prisma.user.count()]), prisma.$queryRaw<{ n: number }[]>`select 2::int as n`]);
    expect(users).toHaveLength(2);
    expect(two[0]?.n).toBe(2);
    expect(pool.totalCount).toBeGreaterThanOrEqual(2);
    await prisma.$disconnect();
    expect(pool.ended).toBe(true);
  });

  it("keeps the connections of a burst for the next one", async () => {
    const pool = openPool(TEST_DATABASE_URL!, { max: 6, idleTimeoutMillis: 400 });
    await Promise.all(Array.from({ length: 6 }, () => pool.query("select 1")));
    expect(pool.totalCount).toBe(6);
    await sleep(150);
    expect(pool.idleCount).toBe(6); // still there before the idle time is up
    await sleep(500);
    expect(pool.totalCount).toBe(0); // and let go after it
    await pool.end();
  });
});
