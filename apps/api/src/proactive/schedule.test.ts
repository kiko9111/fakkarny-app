import { describe, expect, it } from "vitest";
import { localToUtc } from "../lib/time";
import { IDLE_MIN, nextLocalTime, nextTickAt } from "./schedule";

const tz = "Africa/Cairo";
const at = (local: string) => localToUtc(local, tz);
const user = { timezone: tz, wakeTime: "07:00", sleepTime: "23:00" };

describe("nextTickAt", () => {
  it("looks again every few minutes while the user is awake", () => {
    const now = at("2026-11-19T13:00");
    expect(nextTickAt(user, now).getTime() - now.getTime()).toBe(IDLE_MIN * 60_000);
  });

  it("waits for wake time while the user sleeps", () => {
    expect(nextTickAt(user, at("2026-11-19T23:30"))).toEqual(at("2026-11-20T07:00"));
    expect(nextTickAt(user, at("2026-11-20T03:00"))).toEqual(at("2026-11-20T07:00"));
  });

  it("handles a bedtime after midnight", () => {
    const owl = { ...user, wakeTime: "10:00", sleepTime: "02:00" };
    expect(nextTickAt(owl, at("2026-11-20T01:00")).getTime() - at("2026-11-20T01:00").getTime()).toBe(IDLE_MIN * 60_000);
    expect(nextTickAt(owl, at("2026-11-20T02:30"))).toEqual(at("2026-11-20T10:00"));
  });

  it("waits for local midnight once the day's budget is spent", () => {
    expect(nextTickAt(user, at("2026-11-19T15:00"), { budgetSpent: true })).toEqual(at("2026-11-20T00:00"));
  });

  it("never schedules less than a minute or more than a day ahead", () => {
    const now = at("2026-11-19T06:59:30");
    expect(nextTickAt(user, now).getTime()).toBe(now.getTime() + 60_000);
  });

  it("finds the next local clock time", () => {
    expect(nextLocalTime(at("2026-11-19T06:00"), tz, "07:00")).toEqual(at("2026-11-19T07:00"));
    expect(nextLocalTime(at("2026-11-19T07:00"), tz, "07:00")).toEqual(at("2026-11-20T07:00"));
  });
});
