import type { Item } from "@fakkarni/shared";
import { getDb } from "./database";

interface Row extends Omit<Item, "important" | "alarm" | "user_id"> {
  important: number;
  alarm: number | null;
}

const toItem = (r: Row): Item => ({ ...r, user_id: "", important: r.important === 1, alarm: r.alarm === 1, repeat_every_minutes: r.repeat_every_minutes ?? null });

/** Open reminders/tasks for the Upcoming tab, soonest first, undated last. */
export async function listUpcoming(): Promise<Item[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>(
    "SELECT * FROM items WHERE status = 'open' AND type IN ('reminder','task','list_item') ORDER BY due_at IS NULL, due_at ASC, created_at DESC",
  );
  return rows.map(toItem);
}

/** Open reminders that ring as alarms, soonest first (the Alarms list in Me). */
export async function listAlarms(): Promise<Item[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>(
    "SELECT * FROM items WHERE status = 'open' AND alarm = 1 AND type IN ('reminder','task') ORDER BY COALESCE(remind_at, due_at) IS NULL, COALESCE(remind_at, due_at) ASC",
  );
  return rows.map(toItem);
}

/** Open debts for the Money tab. */
export async function listDebts(): Promise<Item[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>("SELECT * FROM items WHERE status = 'open' AND type = 'debt' ORDER BY created_at DESC");
  return rows.map(toItem);
}

/** Open items that need local notifications re-planned when the app comes back (repeating reminders, follow-ups). */
export async function listScheduled(): Promise<Item[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>(
    "SELECT * FROM items WHERE status = 'open' AND type IN ('reminder','task') AND (repeat_every_minutes IS NOT NULL OR follow_up_at IS NOT NULL OR remind_at IS NOT NULL)",
  );
  return rows.map(toItem);
}

/** id → updated_at of every local item, to tell which server items are new or changed. */
export async function localItemVersions(): Promise<Map<string, string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; updated_at: string }>("SELECT id, updated_at FROM items");
  return new Map(rows.map((r) => [r.id, r.updated_at]));
}
