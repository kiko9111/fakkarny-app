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
