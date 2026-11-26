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

    let unstick!: () => void;
    track(new Promise<void>((resolve) => (unstick = resolve)));
    started = Date.now();
    await backgroundSettled(50);
    expect(Date.now() - started).toBeLessThan(1_000);
    unstick(); // nothing is left running for the next test
  });

  it("waits as well for work that tracked work starts as it ends (a chat turn's push to another person)", async () => {
    await backgroundSettled(1_000);
    expect(backgroundCount()).toBe(0);
    const ended: string[] = [];
    // A chat turn: as it ends it starts a push to another person and a row for the dashboard.
    track(
      later(30, null).then(() => {
        track(later(40, null).then(() => ended.push("push")));
        inBackground(later(20, null).then(() => ended.push("row")));
      }),
    );
    const started = Date.now();
    await backgroundSettled(1_000);
    expect(ended.sort()).toEqual(["push", "row"]);
    expect(Date.now() - started).toBeLessThan(500); // and no longer than that
  });

  it("still stops at its limit when tracked work keeps starting more", async () => {
    let stop = false;
    const again = (): Promise<unknown> =>
      later(10, null).then(() => {
        if (!stop) track(again());
      });
    track(again());
    const started = Date.now();
    await backgroundSettled(100);
    const took = Date.now() - started;
    stop = true;
    expect(took).toBeGreaterThanOrEqual(90);
    expect(took).toBeLessThan(600);
    await backgroundSettled(1_000); // the chain ends before the next test
    expect(backgroundCount()).toBe(0);
    expect(Date.now() - started).toBeLessThan(600);
  });

  it("returns the work itself, so a caller can still wait for it", async () => {
    await expect(track(Promise.resolve(42))).resolves.toBe(42);
  });
});
