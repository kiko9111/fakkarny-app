import * as SQLite from "expo-sqlite";
import { MIGRATIONS } from "./schema";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Open the local database once and bring its schema up to date. */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync("fakkarni.db");
      await db.execAsync("PRAGMA journal_mode = WAL;");
      const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
      let version = row?.user_version ?? 0;
      for (; version < MIGRATIONS.length; version++) {
        const sql = MIGRATIONS[version]!;
        await db.withTransactionAsync(async () => {
          await db.execAsync(sql);
          await db.execAsync(`PRAGMA user_version = ${version + 1}`);
        });
      }
      return db;
    })();
  }
  return dbPromise;
}
