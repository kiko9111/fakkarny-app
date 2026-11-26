import { describe, expect, it } from "vitest";
import { planTimes } from "./plan-time";

const at = (remind_at: string | null, due_at: string | null, alarm = false) => ({ remind_at, due_at, alarm });

describe("planTimes", () => {
  it("shows the plan's own time, and the reminder beside it when it is set apart", () => {
    expect(planTimes(at("2026-11-27T15:00:00.000Z", "2026-11-27T17:00:00.000Z"))).toEqual({ main: "2026-11-27T17:00:00.000Z", reminder: "2026-11-27T15:00:00.000Z" });
  });

  it("shows one time when Zaki reminds at the plan's time", () => {
    expect(planTimes(at("2026-11-27T17:00:00.000Z", "2026-11-27T17:00:00Z"))).toEqual({ main: "2026-11-27T17:00:00Z", reminder: null });
  });

  it("shows when Zaki reminds for a plan with no time of its own", () => {
    expect(planTimes(at("2026-11-27T09:00:00.000Z", null))).toEqual({ main: "2026-11-27T09:00:00.000Z", reminder: null });
  });

  it("shows an alarm's own time only", () => {
    expect(planTimes(at("2026-11-27T06:30:00.000Z", "2026-11-27T09:00:00.000Z", true))).toEqual({ main: "2026-11-27T06:30:00.000Z", reminder: null });
    expect(planTimes(at(null, "2026-11-27T09:00:00.000Z", true))).toEqual({ main: "2026-11-27T09:00:00.000Z", reminder: null });
  });

  it("shows nothing for a plan with no time", () => {
    expect(planTimes(at(null, null))).toEqual({ main: null, reminder: null });
  });
});
