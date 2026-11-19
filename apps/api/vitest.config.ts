import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Pick up TEST_DATABASE_URL from apps/api/.env when present (DB tests skip without it).
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  test: {
    globalSetup: ["./test/global-setup.ts"],
    // DB tests share one database; run files one at a time.
    fileParallelism: false,
  },
});
