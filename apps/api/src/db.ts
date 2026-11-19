import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

let client: PrismaClient | undefined;

/** Lazily created so the API (and /health) can start without a database. */
export function db(): PrismaClient {
  if (!client) {
    const connectionString = process.env["DATABASE_URL"];
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  }
  return client;
}
