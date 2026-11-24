import { describe, expect, it, vi } from "vitest";
vi.mock("@/i18n", () => ({ t: { errors: { busy: "busy", signIn: "signin", slow: "slow", data: "data", server: "server" } } }));
vi.mock("@/sync/queue", () => ({ HttpError: class HttpError extends Error { constructor(public status: number) { super(String(status)); } } }));
const { failText } = await import("./errors");
const { HttpError } = await import("@/sync/queue");

describe("failText", () => {
  it("names the cause with a code", () => {
    expect(failText(new HttpError(429), "off")).toBe("busy (429)");
    expect(failText(new HttpError(503), "off")).toBe("server (503)");
    expect(failText(new HttpError(0), "off")).toBe("slow (timeout)");
    expect(failText({ issues: [] }, "off")).toBe("data (data)");
    expect(failText(new HttpError(404), "off")).toBe("off (404)");
  });
  it("keeps the plain offline text for a network failure", () => {
    expect(failText(new TypeError("Network request failed"), "off")).toBe("off");
  });
});
