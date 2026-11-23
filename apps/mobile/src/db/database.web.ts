import initSqlJs from "sql.js/dist/sql-asm.js";
import type { Database } from "sql.js";
import { MIGRATIONS } from "./schema";

/**
 * Web build only (the browser preview): the same SQL as the phone, run by sql.js in memory
 * and saved to localStorage, so the chat survives a reload. Same method names as expo-sqlite.
 */
type Param = string | number | null;
const KEY = "zaki-web-db";

class WebDatabase {
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  constructor(private readonly db: Database) {}

  private save() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        const bytes = this.db.export();
        let bin = "";
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
        localStorage.setItem(KEY, btoa(bin));
      } catch {
        // storage blocked or full: keep working in memory
      }
    }, 300);
  }

  async execAsync(sql: string) {
    this.db.exec(sql);
    this.save();
  }
  async runAsync(sql: string, ...params: Param[]) {
    this.db.run(sql, params.flat() as Param[]);
    this.save();
    return { changes: this.db.getRowsModified(), lastInsertRowId: 0 };
  }
  async getAllAsync<T>(sql: string, ...params: Param[]): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params.flat() as Param[]);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      return rows;
    } finally {
      stmt.free();
    }
  }
  async getFirstAsync<T>(sql: string, ...params: Param[]): Promise<T | null> {
    return (await this.getAllAsync<T>(sql, ...params))[0] ?? null;
  }
  async withTransactionAsync(fn: () => Promise<void>) {
    this.db.exec("BEGIN");
    try {
      await fn();
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
    this.save();
  }
}

export type SQLiteDatabase = WebDatabase;
let dbPromise: Promise<WebDatabase> | null = null;

export function getDb(): Promise<WebDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const SQL = await initSqlJs();
      let saved: Uint8Array | undefined;
      try {
        const b64 = localStorage.getItem(KEY);
        if (b64) saved = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      } catch {
        saved = undefined;
      }
      const db = new WebDatabase(new SQL.Database(saved));
      const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
      for (let version = row?.user_version ?? 0; version < MIGRATIONS.length; version++) {
        await db.execAsync(MIGRATIONS[version]!);
        await db.execAsync(`PRAGMA user_version = ${version + 1}`);
      }
      return db;
    })();
  }
  return dbPromise;
}

export function clearWebDb() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
