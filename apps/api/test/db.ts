import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

export const TEST_DATABASE_URL = process.env["TEST_DATABASE_URL"];
/** Use as `describe.skipIf(!hasTestDb)` so DB tests skip cleanly without Postgres. */
export const hasTestDb = Boolean(TEST_DATABASE_URL);

export function testPrisma(): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: TEST_DATABASE_URL! }) });
}

export async function resetDb(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "reflect_messages", "reflect_sessions", "session_consents", "tracker_entries", "trackers", "circle_posts", "circle_tasks", "daftar_entries", "invites", "circle_members", "circles", "events", "summaries", "memories", "items", "messages", "devices", "users" CASCADE',
  );
}
