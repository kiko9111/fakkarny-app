import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// "@/…" as in tsconfig, so tests can import app modules (pure ones; see src/e2e for the client).
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
