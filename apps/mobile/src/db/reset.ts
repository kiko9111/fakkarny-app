import { forgetSaved } from "@/lib/api";
import { clearScheduled } from "@/notifications";
import { prefs } from "@/lib/prefs";
import { getDb } from "./database";

/** Wipe everything on this phone (after account deletion or sign-out). */
export async function resetLocalData(): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.execAsync("DELETE FROM messages; DELETE FROM items; DELETE FROM kv;");
  });
  await clearScheduled();
  prefs.clear();
  forgetSaved();
}
