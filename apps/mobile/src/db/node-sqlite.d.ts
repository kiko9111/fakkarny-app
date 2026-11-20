// Minimal typing for Node's built-in SQLite, used only by sql.test.ts (the app itself
// runs on expo-sqlite; the mobile workspace does not pull in @types/node).
declare module "node:sqlite" {
  export class StatementSync {
    run(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }
}
