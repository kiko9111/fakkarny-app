import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

let client: PrismaClient | undefined;

/** Lazily created so the API (and /health) can start without a database. */
export function db(): PrismaClient {
  if (!client) {
    const connectionString = process.env["DATABASE_URL"];
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    // Supabase's session pooler allows ~15 connections for the whole project; pg-boss keeps a
    // few of its own. Over the limit, new connections are refused and requests fail (500), so
    // the API's pool stays under it and waits for a free connection instead of erroring.
    const max = Number(process.env["DB_POOL_MAX"] ?? 8);
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString, max, connectionTimeoutMillis: 15_000, idleTimeoutMillis: 30_000 }) });
  }
  return client;
}
