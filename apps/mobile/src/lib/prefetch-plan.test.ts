import { describe, expect, it } from "vitest";
import { planPrefetch, PREFETCH_EVERY_MS } from "./prefetch-plan";

describe("planPrefetch", () => {
  it("loads on start, then at most once a minute, never twice at once", () => {
    expect(planPrefetch({ now: 1_000_000, last: 0, running: false })).toBe(true);
    expect(planPrefetch({ now: 1_000_000 + 5_000, last: 1_000_000, running: false })).toBe(false);
    expect(planPrefetch({ now: 1_000_000 + PREFETCH_EVERY_MS, last: 1_000_000, running: false })).toBe(true);
    expect(planPrefetch({ now: 5_000_000, last: 0, running: true })).toBe(false);
  });
});
