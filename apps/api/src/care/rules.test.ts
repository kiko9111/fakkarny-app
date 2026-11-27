import { describe, expect, it } from "vitest";
import { canMark, clock, doseState, slotsBetween, slotsOn } from "./rules";

describe("care rules", () => {
  it("puts local dose times on UTC instants, also across daylight saving", () => {
    expect(slotsOn("2026-11-27", ["20:00", "08:00"], "Africa/Cairo").map((s) => s.dueAt.toISOString())).toEqual(["2026-11-27T06:00:00.000Z", "2026-11-27T18:00:00.000Z"]);
    // Cairo is on summer time in July (UTC+3).
    expect(slotsOn("2026-07-01", ["08:00"], "Africa/Cairo")[0]!.dueAt.toISOString()).toBe("2026-07-01T05:00:00.000Z");
    const span = slotsBetween(["08:00", "20:00"], "Africa/Cairo", new Date("2026-11-26T17:00:00Z"), new Date("2026-11-27T07:00:00Z"));
    expect(span.map((s) => `${s.date} ${s.time}`)).toEqual(["2026-11-26 20:00", "2026-11-27 08:00"]);
  });

  it("says a dose's state", () => {
    const due = new Date("2026-11-27T18:00:00Z");
    expect(doseState(due, null, new Date("2026-11-27T17:00:00Z"), 60)).toBe("later");
    expect(doseState(due, null, new Date("2026-11-27T18:59:00Z"), 60)).toBe("due");
    expect(doseState(due, null, new Date("2026-11-27T19:00:00Z"), 60)).toBe("missed");
    expect(doseState(due, "skipped", new Date("2026-11-27T19:00:00Z"), 60)).toBe("skipped");
    expect(canMark(due, new Date("2026-11-27T17:30:00Z"), 24)).toBe(true);
    expect(canMark(due, new Date("2026-11-28T18:01:00Z"), 24)).toBe(false);
  });

  it("writes the clock the way people say it", () => {
    expect(clock("en", "00:30")).toBe("12:30 AM");
    expect(clock("en", "12:00")).toBe("12:00 PM");
    expect(clock("ar", "20:00")).toBe("8:00 م");
  });
});
