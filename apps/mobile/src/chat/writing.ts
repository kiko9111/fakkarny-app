import type { LocalMessage } from "@/db/messages";

/**
 * Zaki's reply while he is still writing it (pure). The server sends the words of each bubble
 * as the model writes them (sync/stream.ts); the chat draws them under the message they answer
 * and the finished answer, stored like any other, takes their place.
 */
export interface Writing {
  /** The user's message being answered. */
  clientId: string;
  /** The reply's bubbles so far. */
  bubbles: string[];
}

/** The stored reply to the message a draft answers is in the list: the draft has done its job. */
export function replyStored(rows: Pick<LocalMessage, "client_id">[], writing: Writing | null): boolean {
  if (!writing) return false;
  const prefix = `${writing.clientId}:reply:`;
  return rows.some((m) => m.client_id.startsWith(prefix));
}

/** Reply rows are named after the message they answer (the server's `replyClientId`). */
export const replyId = (clientId: string, n: number) => `${clientId}:reply:${n}`;

/** More words for bubble `bubble` of the reply to `clientId`. A reply to another message starts over. */
export function addWriting(now: Writing | null, clientId: string, bubble: number, delta: string): Writing {
  const bubbles = now && now.clientId === clientId ? [...now.bubbles] : [];
  while (bubbles.length <= bubble) bubbles.push("");
  bubbles[bubble] += delta;
  return { clientId, bubbles };
}

/**
 * The chat with the reply being written in place: right under the message it answers, as rows
 * with the ids the stored reply will have, so the finished bubbles replace these without a jump.
 * Nothing is added once the stored reply is in the list, or when its message is not.
 */
export function withWriting(rows: LocalMessage[], writing: Writing | null): LocalMessage[] {
  if (!writing) return rows;
  const shown = writing.bubbles.map((text, n) => ({ text, n })).filter((b) => b.text.trim().length > 0);
  if (!shown.length) return rows;
  const at = rows.findIndex((m) => m.client_id === writing.clientId);
  if (at < 0) return rows;
  if (replyStored(rows, writing)) return rows;
  const asked = Date.parse(rows[at]!.created_at);
  const base = Number.isFinite(asked) ? asked : 0;
  const drafts = shown.map(
    ({ text, n }): LocalMessage => ({
      client_id: replyId(writing.clientId, n),
      role: "friend",
      kind: "chat",
      text,
      // Just after the message it answers, in order (the stored reply is dated the same way).
      created_at: new Date(base + n + 1).toISOString(),
      sync_status: "synced",
      saved: null,
      server_id: null,
      actions: [],
    }),
  );
  return [...rows.slice(0, at + 1), ...drafts, ...rows.slice(at + 1)];
}

/** True for a row that is a reply still being written (it gets no time stamp yet). */
export function isWriting(message: Pick<LocalMessage, "client_id">, writing: Writing | null): boolean {
  return writing !== null && message.client_id.startsWith(`${writing.clientId}:reply:`);
}
