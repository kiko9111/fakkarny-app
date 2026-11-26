import { CHECKOUT_TIMEOUT_MS, pgAdapter } from "./db-pool";
import { PrismaClient } from "./generated/prisma/client";

let client: PrismaClient | undefined;
let warnedAt = 0;

/** Lazily created so the API (and /health) can start without a database. */
export function db(): PrismaClient {
  if (!client) {
    const connectionString = process.env["DATABASE_URL"];
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    // The pool's numbers and what it does when the pooler is full: db-pool.ts. A transaction
    // waits for a connection as long as a single query does (Prisma's own default is 2 s, after
    // which the request failed with a 500 while the pool waited for room).
    client = new PrismaClient({
      adapter: pgAdapter(connectionString, {}, { onNoRoom: warnNoRoom }),
      transactionOptions: { maxWait: CHECKOUT_TIMEOUT_MS },
    });
  }
  return client;
}

/** One line in the server's log, at most every half minute (a count, nothing about the query). */
function warnNoRoom({ open }: { open: number }) {
  const now = Date.now();
  if (now - warnedAt < 30_000) return;
  warnedAt = now;
  console.warn(`db: no room for another connection at the pooler; queries wait for one of this server's ${open}`);
}
