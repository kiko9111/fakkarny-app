/**
 * Local SQLite schema. Append new migrations; never edit a shipped one.
 * Times are ISO-8601 UTC strings (sortable as text).
 */
export const MIGRATIONS: readonly string[] = [
  // v1 — M2: messages + outbox, items, key/value
  `
  CREATE TABLE messages (
    client_id   TEXT PRIMARY KEY NOT NULL,       -- generated on the phone (user) or server id-derived (friend)
    server_id   TEXT,
    role        TEXT NOT NULL CHECK (role IN ('user','friend')),
    kind        TEXT NOT NULL DEFAULT 'chat',
    text        TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending','synced','failed')),
    attempts    INTEGER NOT NULL DEFAULT 0,
    saved_json  TEXT                              -- what this message made the friend remember ("Saved" chip)
  );
  CREATE INDEX messages_created_at ON messages (created_at);
  CREATE INDEX messages_outbox ON messages (sync_status, created_at) WHERE sync_status = 'pending';

  CREATE TABLE items (
    id                TEXT PRIMARY KEY NOT NULL,
    type              TEXT NOT NULL,
    title             TEXT NOT NULL,
    due_at            TEXT,
    remind_at         TEXT,
    important         INTEGER NOT NULL DEFAULT 0,
    status            TEXT NOT NULL DEFAULT 'open',
    debt_person       TEXT,
    debt_amount       REAL,
    debt_direction    TEXT,
    follow_up_at      TEXT,
    source_message_id TEXT,
    updated_at        TEXT NOT NULL,
    created_at        TEXT NOT NULL,
    done_at           TEXT
  );
  CREATE INDEX items_status_due ON items (status, due_at);

  CREATE TABLE kv (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
  // v2 — M4: the friend's indirect question for the reminder notification
  `ALTER TABLE items ADD COLUMN nudge TEXT;`,
  // v3 — repeating reminders ("every hour"): minutes between occurrences
  `ALTER TABLE items ADD COLUMN repeat_every_minutes INTEGER;`,
  // v4 — Zaki's action cards under a reply (what he did in the app, or wants to do)
  `ALTER TABLE messages ADD COLUMN actions_json TEXT;`,
];
