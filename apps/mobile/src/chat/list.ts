import type { LocalMessage } from "@/db/messages";

/**
 * The chat list between reloads (pure). The chat is re-read from the phone's store whenever
 * anything about it changes; these keep that from redrawing bubbles that did not change and from
 * losing a message typed a moment ago.
 */

const sameJson = (a: unknown, b: unknown) => a === b || (a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b));

const same = (a: LocalMessage, b: LocalMessage) =>
  a.client_id === b.client_id &&
  a.text === b.text &&
  a.sync_status === b.sync_status &&
  a.created_at === b.created_at &&
  a.server_id === b.server_id &&
  a.kind === b.kind &&
  a.role === b.role &&
  sameJson(a.saved, b.saved) &&
  sameJson(a.actions, b.actions);

/**
 * `next`, built from the objects already on screen wherever a message did not change, so only
 * what changed redraws; `prev` itself when nothing did (the screen then does not redraw at all).
 */
export function keepSame(prev: LocalMessage[], next: LocalMessage[]): LocalMessage[] {
  const old = new Map(prev.map((m) => [m.client_id, m]));
  let changed = prev.length !== next.length;
  const out = next.map((m, i) => {
    const was = old.get(m.client_id);
    const keep = was && same(was, m) ? was : m;
    if (keep !== prev[i]) changed = true;
    return keep;
  });
  return changed ? out : prev;
}

/**
 * The stored rows plus messages typed a moment ago that the store does not hold yet (still being
 * written): they stay on screen, last, instead of blinking out when a reload lands in between.
 */
export function withDrafts(rows: LocalMessage[], drafts: LocalMessage[]): LocalMessage[] {
  if (!drafts.length) return rows;
  const held = new Set(rows.map((m) => m.client_id));
  const missing = drafts.filter((d) => !held.has(d.client_id));
  return missing.length ? [...rows, ...missing] : rows;
}

/**
 * When a message typed now is dated: the phone's clock, but never before the newest message on
 * screen (replies carry server time; a phone clock running behind would put the new bubble above
 * Zaki's last reply until the server dates it).
 */
export function draftTime(now: number, latest: string | undefined): string {
  const last = latest ? Date.parse(latest) : NaN;
  return new Date(Number.isFinite(last) && last >= now ? last + 1 : now).toISOString();
}
