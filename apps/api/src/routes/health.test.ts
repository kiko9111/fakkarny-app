import { afterAll, describe, expect, it } from "vitest";
import { HealthResponse } from "@fakkarni/shared";
import { buildApp } from "../app";

describe("GET /health", () => {
  const app = buildApp({ logger: false });
  afterAll(() => app.close());

  it("returns ok and matches the shared contract", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = HealthResponse.parse(res.json());
    expect(body.status).toBe("ok");
    expect(body.pid).toBe(process.pid);
    // From the API's package.json, which the server reads itself (no npm in front of it).
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("404s unknown routes", async () => {
    const res = await app.inject({ method: "GET", url: "/nope" });
    expect(res.statusCode).toBe(404);
  });
});
