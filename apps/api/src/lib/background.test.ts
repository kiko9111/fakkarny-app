import { describe, expect, it } from "vitest";
import { backgroundCount, backgroundSettled, inBackground, track } from "./background";

const later = <T>(ms: number, value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

describe("work the answer doesn't wait for", () => {
  it("is counted while it runs, and a failure is dropped", async () => {
    const before = backgroundCount();
    inBackground(later(20, 1));
    inBackground(Promise.reject(new Error("dashboard row failed")));
    expect(backgroundCount()).toBe(before + 2);
    await backgroundSettled(1_000);
    expect(backgroundCount()).toBe(before);
  });

  it("lets the server's stop wait for it, but no longer than it says", async () => {
    const push = track(later(30, "sent"));
    let started = Date.now();
    await backgroundSettled(1_000);
    expect(Date.now() - started).toBeGreaterThanOrEqual(25);
    await expect(push).resolves.toBe("sent");

    track(later(5_000, "stuck"));
    started = Date.now();
    await backgroundSettled(50);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("returns the work itself, so a caller can still wait for it", async () => {
    await expect(track(Promise.resolve(42))).resolves.toBe(42);
  });
});
