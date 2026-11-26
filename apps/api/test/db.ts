import { pgAdapter } from "../src/db-pool";
import { PrismaClient } from "../src/generated/prisma/client";

export const TEST_DATABASE_URL = process.env["TEST_DATABASE_URL"];
/** Use as `describe.skipIf(!hasTestDb)` so DB tests skip cleanly without Postgres. */
export const hasTestDb = Boolean(TEST_DATABASE_URL);

/** The server's own pool class (src/db-pool.ts), so every database test runs through it. */
export function testPrisma(): PrismaClient {
  return new PrismaClient({ adapter: pgAdapter(TEST_DATABASE_URL!, { max: 10, idleTimeoutMillis: 10_000 }) });
}

export async function resetDb(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "reflect_messages", "reflect_sessions", "session_consents", "tracker_entries", "trackers", "circle_posts", "circle_tasks", "daftar_entries", "invites", "circle_members", "circles", "events", "splits", "photos", "summaries", "memories", "items", "messages", "devices", "push_tickets", "users" CASCADE',
  );
}
