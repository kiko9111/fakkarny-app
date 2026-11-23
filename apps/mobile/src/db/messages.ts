import { randomUUID } from "expo-crypto";
import type { ChatAction, Item, MessageKind, MessageRole, PostMessageResponse } from "@fakkarni/shared";
import type { OutboxMessage, OutboxStore } from "@/sync/queue";
import { getDb } from "./database";
import { parseSaved, summarizeSaved, type SavedSummary } from "./saved";
import { LIST_MESSAGES_SQL, MESSAGES_WITH_CARD_SQL, PENDING_MESSAGES_SQL, UPSERT_SERVER_MESSAGE_SQL } from "./sql";

export type SyncStatus = "pending" | "synced" | "failed";

export interface LocalMessage {
  client_id: string;
  role: MessageRole;
  kind: MessageKind;
  text: string;
  created_at: string;
  sync_status: SyncStatus;
  saved: SavedSummary | null;
  /** Server id (friend replies and synced messages): needed to answer an action card. */
  server_id: string | null;
  /** Zaki's action cards under this reply. */
  actions: ChatAction[];
}

interface Row {
  client_id: string;
  role: MessageRole;
  kind: MessageKind;
  text: string;
  created_at: string;
  sync_status: SyncStatus;
  attempts: number;
  saved_json: string | null;
  server_id?: string | null;
  actions_json?: string | null;
}

/** Stored cards, tolerating anything odd in the column. */
export function parseActions(json: string | null | undefined): ChatAction[] {
  if (!json) return [];
  try {
    const v: unknown = JSON.parse(json);
    if (!Array.isArray(v)) return [];
    return v.filter((c): c is ChatAction => !!c && typeof c === "object" && typeof c.id === "string" && typeof c.label === "string" && typeof c.status === "string");
  } catch {
    return [];
  }
}

const toLocal = (r: Row): LocalMessage => ({
  client_id: r.client_id,
  role: r.role,
  kind: r.kind,
  text: r.text,
  created_at: r.created_at,
  sync_status: r.sync_status,
  saved: parseSaved(r.saved_json),
  server_id: r.server_id ?? null,
  actions: parseActions(r.actions_json),
});

/** Save the user's message locally first; the outbox sends it when online. */
export async function addUserMessage(text: string): Promise<LocalMessage> {
  const db = await getDb();
  const row: Row = {
    client_id: randomUUID(),
    role: "user",
    kind: "chat",
    text: text.trim(),
    created_at: new Date().toISOString(),
    sync_status: "pending",
    attempts: 0,
    saved_json: null,
    server_id: null,
    actions_json: null,
  };
  await db.runAsync(
    "INSERT INTO messages (client_id, role, kind, text, created_at, sync_status) VALUES (?, ?, ?, ?, ?, ?)",
    row.client_id, row.role, row.kind, row.text, row.created_at, row.sync_status,
  );
  return toLocal(row);
}

/** Latest messages, oldest first. */
export async function listMessages(limit = 200): Promise<LocalMessage[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>(LIST_MESSAGES_SQL, limit);
  return rows.map(toLocal);
}

export async function upsertItem(i: Item): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO items (id, type, title, due_at, remind_at, important, status, debt_person, debt_amount, debt_direction,
       follow_up_at, source_message_id, updated_at, created_at, done_at, nudge, repeat_every_minutes, alarm)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET type=excluded.type, title=excluded.title, due_at=excluded.due_at,
       remind_at=excluded.remind_at, important=excluded.important, status=excluded.status,
       debt_person=excluded.debt_person, debt_amount=excluded.debt_amount, debt_direction=excluded.debt_direction,
       follow_up_at=excluded.follow_up_at, updated_at=excluded.updated_at, done_at=excluded.done_at, nudge=excluded.nudge,
       repeat_every_minutes=excluded.repeat_every_minutes, alarm=excluded.alarm
     WHERE excluded.updated_at >= items.updated_at`,
    i.id, i.type, i.title, i.due_at, i.remind_at, i.important ? 1 : 0, i.status, i.debt_person, i.debt_amount,
    i.debt_direction, i.follow_up_at, i.source_message_id, i.updated_at, i.created_at, i.done_at, i.nudge,
    i.repeat_every_minutes ?? null, i.alarm ? 1 : 0,
  );
}

/** Insert messages that came from the server (friend replies, proactive messages). */
export async function insertServerMessages(messages: PostMessageResponse["replies"]): Promise<void> {
  const db = await getDb();
  for (const m of messages) {
    const actions = m.actions?.length ? JSON.stringify(m.actions) : null;
    await db.runAsync(
      UPSERT_SERVER_MESSAGE_SQL,
      m.client_id, m.id, m.role, m.kind, m.text, m.created_at, actions,
    );
    // A reply to "yes" carries the answered card with the same id: update the old copy too.
    for (const card of m.actions ?? []) {
      if (card.status === "pending") continue;
      const older = await db.getAllAsync<{ client_id: string; actions_json: string | null }>(
        MESSAGES_WITH_CARD_SQL,
        `%${card.id}%`, m.client_id,
      );
      for (const o of older) {
        const next = parseActions(o.actions_json).map((c) => (c.id === card.id ? card : c));
        await db.runAsync("UPDATE messages SET actions_json = ? WHERE client_id = ?", JSON.stringify(next), o.client_id);
      }
    }
  }
}

export const sqliteOutbox: OutboxStore = {
  async pending(): Promise<OutboxMessage[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<Row>(PENDING_MESSAGES_SQL);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return rows.map((r) => ({ client_id: r.client_id, text: r.text, created_at: r.created_at, timezone, attempts: r.attempts }));
  },

  async markSynced(clientId, res) {
    const db = await getDb();
    const saved = summarizeSaved(res);
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        // Take the server's timestamp too: replies carry server time, and a phone clock
        // that runs ahead would otherwise sort every reply above the message it answers.
        "UPDATE messages SET sync_status = 'synced', server_id = ?, saved_json = ?, created_at = ? WHERE client_id = ?",
        res.message.id, saved ? JSON.stringify(saved) : null, res.message.created_at, clientId,
      );
      await insertServerMessages(res.replies);
      for (const item of res.items) await upsertItem(item);
    });
  },

  async markAttempt(clientId) {
    const db = await getDb();
    await db.runAsync("UPDATE messages SET attempts = attempts + 1 WHERE client_id = ?", clientId);
  },

  async markFailed(clientId) {
    const db = await getDb();
    await db.runAsync("UPDATE messages SET sync_status = 'failed' WHERE client_id = ?", clientId);
  },
};

export async function getMessage(clientId: string): Promise<LocalMessage | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Row>("SELECT * FROM messages WHERE client_id = ?", clientId);
  return row ? toLocal(row) : null;
}

/** Update what the "Saved" chip shows after the user fixes or removes something. */
export async function setSaved(clientId: string, saved: SavedSummary | null): Promise<void> {
  const db = await getDb();
  const empty = !saved || (saved.items.length === 0 && saved.memories.length === 0);
  await db.runAsync("UPDATE messages SET saved_json = ? WHERE client_id = ?", empty ? null : JSON.stringify(saved), clientId);
}

/** Newest server timestamp we hold, used to pull messages the server started (briefs, check-ins). */
export async function latestServerMessageAt(): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ at: string | null }>("SELECT MAX(created_at) AS at FROM messages WHERE server_id IS NOT NULL");
  return row?.at ?? null;
}

/** Replace one message's action cards (after the user answered one). */
export async function setActions(serverId: string, actions: ChatAction[]): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE messages SET actions_json = ? WHERE server_id = ?", actions.length ? JSON.stringify(actions) : null, serverId);
}

/**
 * A message Zaki writes on the phone itself (introducing a place in the app). Never sent to the
 * server; placed after the newest message so it reads as the latest thing Zaki said.
 */
export async function addLocalFriendMessage(clientId: string, text: string, actions: ChatAction[]): Promise<void> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ at: string | null }>("SELECT MAX(created_at) AS at FROM messages");
  const latest = row?.at ? new Date(row.at).getTime() : 0;
  const at = new Date(Math.max(Date.now(), latest + 1)).toISOString();
  await db.runAsync(
    "INSERT OR IGNORE INTO messages (client_id, role, kind, text, created_at, sync_status, actions_json) VALUES (?, 'friend', 'chat', ?, ?, 'synced', ?)",
    clientId, text, at, actions.length ? JSON.stringify(actions) : null,
  );
}
