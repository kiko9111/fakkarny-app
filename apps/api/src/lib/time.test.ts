import { describe, expect, it } from "vitest";
import { describeNow, describeUpcomingDays, isAwake, localToUtc, toLocalIso } from "./time";

describe("time zones", () => {
  it("converts Cairo wall-clock to UTC (Egypt is UTC+2 in November)", () => {
    expect(localToUtc("2026-11-22T18:00", "Africa/Cairo").toISOString()).toBe("2026-11-22T16:00:00.000Z");
  });

  it("handles Cairo summer time (UTC+3 in July)", () => {
    expect(localToUtc("2026-07-10T09:00", "Africa/Cairo").toISOString()).toBe("2026-07-10T06:00:00.000Z");
  });

  it("converts Riyadh (UTC+3, no DST) and Dubai (UTC+4)", () => {
    expect(localToUtc("2026-11-22T09:00", "Asia/Riyadh").toISOString()).toBe("2026-11-22T06:00:00.000Z");
    expect(localToUtc("2026-11-22T09:00", "Asia/Dubai").toISOString()).toBe("2026-11-22T05:00:00.000Z");
  });

  it("round-trips through toLocalIso", () => {
    const d = new Date("2026-11-19T21:30:00.000Z");
    expect(toLocalIso(d, "Africa/Cairo")).toBe("2026-11-19T23:30");
    expect(localToUtc(toLocalIso(d, "Africa/Cairo"), "Africa/Cairo").toISOString()).toBe(d.toISOString());
  });

  it("crosses midnight into the next local day", () => {
    expect(toLocalIso(new Date("2026-11-19T23:30:00.000Z"), "Asia/Dubai")).toBe("2026-11-20T03:30");
  });

  it("rejects malformed local strings", () => {
    expect(() => localToUtc("Sunday at 6", "Africa/Cairo")).toThrow();
    expect(() => localToUtc("2026-02-30T10:00", "Africa/Cairo")).toThrow();
    expect(() => localToUtc("2026-11-22T25:00", "Africa/Cairo")).toThrow();
  });

  it("describes now with the weekday", () => {
    expect(describeNow(new Date("2026-11-19T12:05:00.000Z"), "Africa/Cairo")).toBe("Thursday 2026-11-19 14:05 (Africa/Cairo)");
  });
});

describe("isAwake", () => {
  const tz = "Africa/Cairo";
  it("is true between wake and sleep", () => {
    expect(isAwake(new Date("2026-11-19T10:00:00Z"), tz, "07:00", "23:00")).toBe(true); // 12:00 local
    expect(isAwake(new Date("2026-11-19T03:00:00Z"), tz, "07:00", "23:00")).toBe(false); // 05:00 local
  });
  it("handles a sleep time after midnight", () => {
    expect(isAwake(new Date("2026-11-19T22:30:00Z"), tz, "09:00", "01:30")).toBe(true); // 00:30 local
    expect(isAwake(new Date("2026-11-19T00:00:00Z"), tz, "09:00", "01:30")).toBe(false); // 02:00 local
  });

  it("lists upcoming local dates with weekdays, across a month end", () => {
    // 23:30 UTC on Nov 28 is already Nov 29 01:30 in Cairo.
    expect(describeUpcomingDays(new Date("2026-11-28T23:30:00.000Z"), "Africa/Cairo", 4)).toBe(
      "today Sunday 2026-11-29, tomorrow Monday 2026-11-30, Tuesday 2026-12-01, Wednesday 2026-12-02",
    );
  });
});
