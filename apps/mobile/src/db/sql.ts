/**
 * SQL used by the chat, kept free of expo-sqlite so vitest can run it against a real
 * SQLite (node:sqlite) together with the migrations in schema.ts.
 */

/**
 * Latest N messages, oldest first. The inner query has to select rowid under a name:
 * a subquery's result has no implicit rowid, so ordering the outer query by `rowid` fails.
 */
export const LIST_MESSAGES_SQL =
  "SELECT * FROM (SELECT *, rowid AS rid FROM messages ORDER BY created_at DESC, rowid DESC LIMIT ?) ORDER BY created_at ASC, rid ASC";

export const PENDING_MESSAGES_SQL =
  "SELECT * FROM messages WHERE sync_status = 'pending' AND role = 'user' ORDER BY created_at ASC, rowid ASC";

/**
 * A message from the server. A row we already hold keeps everything but takes newer action
 * cards (a pull after the user answered one), never losing cards to a reply without them.
 */
export const UPSERT_SERVER_MESSAGE_SQL = `INSERT INTO messages (client_id, server_id, role, kind, text, created_at, sync_status, actions_json)
  VALUES (?, ?, ?, ?, ?, ?, 'synced', ?)
  ON CONFLICT(client_id) DO UPDATE SET actions_json = excluded.actions_json WHERE excluded.actions_json IS NOT NULL`;

/** Older messages that may carry a card with this id (the JSON is checked in code). */
export const MESSAGES_WITH_CARD_SQL = "SELECT client_id, actions_json FROM messages WHERE actions_json LIKE ? AND client_id != ?";

/** id and status of the items with these ids (n of them; the reminders in the notification shade). */
export function itemStatusesSql(n: number): string {
  return `SELECT id, status FROM items WHERE id IN (${marks(n)})`;
}

/** Every column of the items with these `n` ids. */
export function itemsByIdsSql(n: number): string {
  return `SELECT * FROM items WHERE id IN (${marks(n)})`;
}

const marks = (n: number) => Array.from({ length: Math.max(n, 1) }, () => "?").join(", ");
