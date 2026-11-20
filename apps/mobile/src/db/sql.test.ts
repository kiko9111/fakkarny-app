import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { MIGRATIONS } from "./schema";
import { LIST_MESSAGES_SQL, PENDING_MESSAGES_SQL } from "./sql";

function freshDb() {
  const db = new DatabaseSync(":memory:");
  for (const sql of MIGRATIONS) db.exec(sql);
  const insert = db.prepare("INSERT INTO messages (client_id, role, kind, text, created_at, sync_status) VALUES (?, ?, 'chat', ?, ?, ?)");
  return { db, insert };
}

describe("chat SQL against a real SQLite", () => {
  it("applies every migration", () => {
    expect(() => freshDb()).not.toThrow();
  });

  it("lists the latest messages oldest first, breaking timestamp ties by insert order", () => {
    const { db, insert } = freshDb();
    insert.run("a", "user", "first", "2026-11-20T10:00:00.000Z", "synced");
    insert.run("b", "friend", "reply 1", "2026-11-20T10:00:01.000Z", "synced");
    insert.run("c", "friend", "reply 2", "2026-11-20T10:00:01.000Z", "synced");
    insert.run("d", "user", "last", "2026-11-20T10:00:02.000Z", "pending");
    const all = db.prepare(LIST_MESSAGES_SQL).all(200) as { client_id: string }[];
    expect(all.map((r) => r.client_id)).toEqual(["a", "b", "c", "d"]);
    const lastTwo = db.prepare(LIST_MESSAGES_SQL).all(2) as { client_id: string }[];
    expect(lastTwo.map((r) => r.client_id)).toEqual(["c", "d"]);
  });

  it("returns only the user's unsent messages for the outbox", () => {
    const { db, insert } = freshDb();
    insert.run("a", "user", "sent", "2026-11-20T10:00:00.000Z", "synced");
    insert.run("b", "user", "waiting", "2026-11-20T10:00:01.000Z", "pending");
    const rows = db.prepare(PENDING_MESSAGES_SQL).all() as { client_id: string }[];
    expect(rows.map((r) => r.client_id)).toEqual(["b"]);
  });
});
