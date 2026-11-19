import { randomUUID } from "expo-crypto";
import { getDb } from "./database";

export async function kvGet(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM kv WHERE key = ?", key);
  return row?.value ?? null;
}

export async function kvSet(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value);
}

let installId: Promise<string> | null = null;

/** Random ID for this install; identifies the phone to the API until sign-in arrives (M5). */
export function getInstallId(): Promise<string> {
  if (!installId) {
    installId = (async () => {
      const existing = await kvGet("install_id");
      if (existing) return existing;
      const id = randomUUID();
      await kvSet("install_id", id);
      return id;
    })();
  }
  return installId;
}
