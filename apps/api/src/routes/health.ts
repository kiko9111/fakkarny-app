import { readFileSync } from "node:fs";
import type { FastifyPluginAsync } from "fastify";
import type { HealthResponse } from "@fakkarni/shared";

// Read from the API's package.json: the container starts node directly, so npm's
// npm_package_version is not set.
const VERSION = (JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version?: string }).version ?? "0.1.0";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async (): Promise<HealthResponse> => ({
    status: "ok",
    service: "fakkarni-api",
    version: VERSION,
    time: new Date().toISOString(),
    // 1 in the container: the server is its first process and hears a deploy's stop signal (Dockerfile).
    pid: process.pid,
  }));
};
