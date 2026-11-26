/**
 * The API's database pool (speed thread, 2026-11-26).
 *
 * Opening a connection to the database is several round trips in a row (TCP, TLS, sign-in):
 * about half a second while the API and the database are an ocean apart. The pool used to let
 * a connection go after 30 idle seconds, and one person using the app leaves the server quiet
 * that long all the time, so most of their messages paid for new connections first (measured
 * live: first words 2.6 s after a quiet half minute, 1.5 s on the message right after it). A
 * connection now stays for five minutes after its last use.
 *
 * Kept connections count against the pooler's small limit: Supabase's session pooler gives the
 * whole project about 15, pg-boss holds a few (jobs/index.ts), and while a deploy has two
 * servers running the old one may sit on most of them. A plain pool answers "no room" by
 * failing the query (a 500). This one stops growing, lets the query wait for one of the
 * connections it already has, and tries one more connection a few seconds later.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

/** The pool's numbers in one place: the server, the tests and the speed harnesses share them. */
export function poolSettings(env: Record<string, string | undefined> = process.env) {
  return {
    max: positive(env["DB_POOL_MAX"], 8),
    // How long a connection is kept after its last use. Long enough to span the pauses between
    // one person's messages; short enough that a server nobody talks to gives its places back.
    idleTimeoutMillis: positive(env["DB_POOL_IDLE_MS"], 5 * 60_000),
    // A query waits this long for a free connection before it fails.
    connectionTimeoutMillis: 15_000,
    // A kept connection crosses the internet: a sign of life every 10 s keeps the boxes on the
    // way from forgetting it, and a connection that died without a word is noticed within
    // about 20 s and dropped, instead of being handed to a query.
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  };
}

function positive(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Postgres itself (code 53300: "sorry, too many clients already", "too many connections for
// role", "remaining connection slots are reserved"), Supabase's pooler in session mode
// ("(EMAXCONNSESSION) max clients reached in session mode - max clients are limited to
// pool_size: 15", code XX000; "max client connections reached") and PgBouncer ("no more
// connections allowed (max_client_conn)").
const NO_ROOM = /max clients? (connections )?reached|too many (clients|connections)|connection slots are reserved|no more connections allowed|EMAXCONN/i;

/** A new connection was refused because the database, or the pooler in front of it, is full. */
export function isNoRoom(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; message?: unknown };
  return e.code === "53300" || (typeof e.message === "string" && NO_ROOM.test(e.message));
}

export type Patience = {
  /** How long one query keeps trying while it is refused for lack of room (default 10 s). */
  patienceMs?: number;
  /** How long the pool stays at its size after a refusal before it tries one more connection (default 3 s). */
  regrowMs?: number;
  /** Told about every refusal: how many connections this pool has (never a query or its values). */
  onNoRoom?: (info: { open: number }) => void;
};

/** The callback form of pg's `pool.connect` (its last overload). */
type Checkout = Parameters<pg.Pool["connect"]>[0];

const FIRST_WAIT_MS = 100;
const MAX_WAIT_MS = 1_000;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * pg's pool, which opens a new connection whenever none is free and it is under `max`, with
 * one change: when the server says there is no room for another, `max` drops to the
 * connections the pool has, so every waiting query queues for one of those (pg's own queue,
 * first come first served) instead of failing. After `regrowMs` it allows itself one more
 * attempt; the first connection that is let in puts `max` back.
 */
export class PatientPool extends pg.Pool {
  readonly #ceiling: number;
  readonly #patienceMs: number;
  readonly #regrowMs: number;
  readonly #onNoRoom: Patience["onNoRoom"];
  /** When the pool may try one more connection again; 0 while it is not held back. */
  #growAt = 0;
  /** Connections that were let in and not closed since (pg's own count includes attempts on their way). */
  readonly #let = new Set<unknown>();

  constructor(config: pg.PoolConfig, patience: Patience = {}) {
    super(config);
    this.#ceiling = this.options.max;
    this.#patienceMs = patience.patienceMs ?? 10_000;
    this.#regrowMs = patience.regrowMs ?? 3_000;
    this.#onNoRoom = patience.onNoRoom;
    this.on("connect", (client) => {
      this.#let.add(client);
      // A new connection was let in: there is room again.
      this.#growAt = 0;
      this.options.max = this.#ceiling;
    });
    this.on("remove", (client) => {
      this.#let.delete(client);
    });
  }

  /** The connections this pool really has: attempts that are still on their way are not among them. */
  get #open(): number {
    return Math.min(this.#let.size, this.totalCount);
  }

  /** How many connections the pool may hold right now (`max`, or fewer while the server is full). */
  get room(): number {
    return this.options.max;
  }

  // Every query goes through here: `pool.query()` calls it with a callback, a transaction
  // without one.
  override connect(): Promise<pg.PoolClient>;
  override connect(callback: Checkout): void;
  override connect(callback?: Checkout): Promise<pg.PoolClient> | void {
    const client = this.#connect();
    if (!callback) return client;
    client.then(
      (c) => callback(undefined, c, c.release),
      (err: Error) => callback(err, undefined, () => {}),
    );
  }

  async #connect(): Promise<pg.PoolClient> {
    const started = Date.now();
    let wait = FIRST_WAIT_MS;
    for (;;) {
      this.#growAgain();
      try {
        return await super.connect();
      } catch (err) {
        if (!isNoRoom(err)) throw err;
        this.#stopGrowing();
        const left = this.#patienceMs - (Date.now() - started);
        if (left <= 0) throw err;
        // With connections of its own the pool is now "full" at its size: asking again queues
        // this query for one of them. With none there is nothing to queue for: it tries a new
        // connection again, a little later each time and not in step with the others.
        if (this.#open > 0) continue;
        await sleep(Math.min(left, wait * (0.75 + Math.random() / 2)));
        wait = Math.min(wait * 2, MAX_WAIT_MS);
      }
    }
  }

  #stopGrowing() {
    // pg starts a new connection for the next query in its queue whenever an attempt fails and
    // it is under `max`: at the pool's real size, that stops with the first refusal.
    this.options.max = Math.max(1, this.#open);
    this.#growAt = Date.now() + this.#regrowMs;
    this.#onNoRoom?.({ open: this.#open });
  }

  #growAgain() {
    if (!this.#growAt || Date.now() < this.#growAt) return;
    // One attempt, not a burst of them: a refusal sets the wait again, a success lifts it.
    this.#growAt = 0;
    this.options.max = Math.min(this.#ceiling, this.#open + 1);
  }
}

/** The API's pool on a database: `poolSettings()`, with `overrides` on top. */
export function openPool(connectionString: string, overrides: pg.PoolConfig = {}, patience: Patience = {}): PatientPool {
  const pool = new PatientPool({ connectionString, ...poolSettings(), ...overrides }, patience);
  // An idle connection the server closed is dropped by the pool, which then tells its
  // listeners. With no listener at all, Node would stop the process for it.
  pool.on("error", () => {});
  return pool;
}

/** Prisma on the API's pool. `$disconnect()` closes the pool. */
export function pgAdapter(connectionString: string, overrides: pg.PoolConfig = {}, patience: Patience = {}): PrismaPg {
  return new PrismaPg(openPool(connectionString, overrides, patience), { disposeExternalPool: true });
}
