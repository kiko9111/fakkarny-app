import { describe, expect, it } from "vitest";
import { LIVE_EVERY_MS, shouldPoll } from "./live-plan";

describe("shouldPoll", () => {
  it("polls an open screen every LIVE_EVERY_MS while the app is in front", () => {
    expect(shouldPoll({ active: true, now: LIVE_EVERY_MS, last: 0 })).toBe(true);
    expect(shouldPoll({ active: true, now: LIVE_EVERY_MS - 1, last: 0 })).toBe(false);
  });
  it("never polls in the background", () => {
    expect(shouldPoll({ active: false, now: 10 * LIVE_EVERY_MS, last: 0 })).toBe(false);
  });
});
