import { describe, expect, it } from "vitest";
import { planPrefetch, PREFETCH_AFTER_CHANGE_MS, PREFETCH_EVERY_MS } from "./prefetch-plan";

describe("planPrefetch", () => {
  it("loads on start, then at most once a minute, never twice at once", () => {
    expect(planPrefetch({ now: 1_000_000, last: 0, running: false })).toBe(true);
    expect(planPrefetch({ now: 1_000_000 + 5_000, last: 1_000_000, running: false })).toBe(false);
    expect(planPrefetch({ now: 1_000_000 + PREFETCH_EVERY_MS, last: 1_000_000, running: false })).toBe(true);
    expect(planPrefetch({ now: 5_000_000, last: 0, running: true })).toBe(false);
  });
  it("refreshes sooner after a change, still never twice at once", () => {
    expect(planPrefetch({ now: 1_000_000 + PREFETCH_AFTER_CHANGE_MS, last: 1_000_000, running: false, changed: true })).toBe(true);
    expect(planPrefetch({ now: 1_000_000 + 1_000, last: 1_000_000, running: false, changed: true })).toBe(false);
    expect(planPrefetch({ now: 9_000_000, last: 0, running: true, changed: true })).toBe(false);
  });
});
