import type { FastifyPluginAsync } from "fastify";
import type { HealthResponse } from "@fakkarni/shared";

const VERSION = process.env["npm_package_version"] ?? "0.1.0";

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
