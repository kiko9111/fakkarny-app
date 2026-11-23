import { describe, expect, it } from "vitest";
import { createAnalyticsQueue, routePattern } from "./analytics-queue";

const at = () => new Date("2026-11-23T10:00:00Z");

describe("analytics queue", () => {
  it("sends in batches and keeps nothing after a send", async () => {
    const sent: string[][] = [];
    const q = createAnalyticsQueue({ send: async (e) => void sent.push(e.map((x) => x.name)), now: at, batchSize: 2 });
    q.track("screen", { route: "/" });
    expect(sent).toEqual([]);
    q.track("place_overview");
    await q.flush();
    expect(sent).toEqual([["screen", "place_overview"]]);
    expect(q.pending()).toBe(0);
  });

  it("drops a batch after three failed sends", async () => {
    const q = createAnalyticsQueue({ send: async () => Promise.reject(new Error("offline")), now: at });
    q.track("screen");
    await q.flush();
    await q.flush();
    expect(q.pending()).toBe(1);
    await q.flush();
    expect(q.pending()).toBe(0);
  });

  it("caps what waits offline", () => {
    const q = createAnalyticsQueue({ send: async () => Promise.reject(new Error("offline")), now: at, batchSize: 1000, maxQueued: 3 });
    for (let i = 0; i < 5; i++) q.track("screen");
    expect(q.pending()).toBe(3);
  });

  it("turns paths into route patterns", () => {
    expect(routePattern("/circle/6f1c2d3e-aaaa-bbbb-cccc-123456789abc")).toBe("/circle/[id]");
    expect(routePattern("/invite/AB3K9XQ")).toBe("/invite/[id]");
    expect(routePattern("/money")).toBe("/money");
  });
});
