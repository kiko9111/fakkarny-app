import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { MIGRATIONS } from "./schema";
import { itemStatusesSql, LIST_MESSAGES_SQL, MESSAGES_WITH_CARD_SQL, PENDING_MESSAGES_SQL, UPSERT_SERVER_MESSAGE_SQL } from "./sql";

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

  it("stores a reply's action cards and takes newer ones without losing them", () => {
    const { db } = freshDb();
    const upsert = db.prepare(UPSERT_SERVER_MESSAGE_SQL);
    const at = "2026-11-20T10:00:00.000Z";
    const pending = JSON.stringify([{ id: "card-1", kind: "assign_task", status: "pending", label: "Ask Mona?", route: null }]);
    upsert.run("r1", "s1", "friend", "chat", "Shall I?", at, pending);
    upsert.run("r1", "s1", "friend", "chat", "Shall I?", at, null); // a pull without cards keeps them
    const row = () => (db.prepare("SELECT actions_json, text FROM messages WHERE client_id = 'r1'").all() as { actions_json: string; text: string }[])[0]!;
    expect(JSON.parse(row().actions_json)[0].status).toBe("pending");
    upsert.run("r1", "s1", "friend", "chat", "changed text", at, pending.replace("pending", "done"));
    expect(JSON.parse(row().actions_json)[0].status).toBe("done");
    expect(row().text).toBe("Shall I?");
    upsert.run("r2", "s2", "friend", "chat", "Done", at, null);
    const found = db.prepare(MESSAGES_WITH_CARD_SQL).all("%card-1%", "r2") as { client_id: string }[];
    expect(found.map((r) => r.client_id)).toEqual(["r1"]);
  });

  it("reads the status of the items in the notification shade, only those the phone holds", () => {
    const { db } = freshDb();
    const add = db.prepare("INSERT INTO items (id, type, title, status, updated_at, created_at) VALUES (?, 'reminder', 'x', ?, ?, ?)");
    const at = "2026-11-26T10:00:00.000Z";
    add.run("a", "open", at, at);
    add.run("b", "done", at, at);
    add.run("c", "cancelled", at, at);
    const rows = db.prepare(itemStatusesSql(3)).all("a", "b", "gone") as { id: string; status: string }[];
    expect(new Map(rows.map((r) => [r.id, r.status]))).toEqual(new Map([["a", "open"], ["b", "done"]]));
    expect(db.prepare(itemStatusesSql(1)).all("c")).toEqual([{ id: "c", status: "cancelled" }]);
  });
});
