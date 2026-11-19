import { describe, expect, it } from "vitest";
import { localToUtc } from "../lib/time";
import { planProactive, type PlanInput, type PlanItem, type PlanUser } from "./plan";

const tz = "Africa/Cairo";
const at = (local: string) => localToUtc(local, tz);
const user = (o: Partial<PlanUser> = {}): PlanUser => ({
  timezone: tz,
  wakeTime: "07:00",
  sleepTime: "23:00",
  checkinIntervalH: "h2",
  ignoredCheckins: 0,
  slowdownNoticed: false,
  lastMorningAt: null,
  lastNightAt: null,
  lastCheckinAt: null,
  lastUserMessageAt: null,
  ...o,
});
const item = (o: Partial<PlanItem>): PlanItem => ({
  id: o.title ?? "i",
  type: "reminder",
  title: "Thing",
  status: "open",
  dueAt: null,
  important: false,
  followUpAt: null,
  followedUpAt: null,
  ...o,
});
const plan = (o: Partial<PlanInput> & { now: Date }) => planProactive({ user: user(), items: [], unpromptedToday: 0, ...o });

describe("good morning (F3)", () => {
  it("fires at wake time and hints at today's items", () => {
    const p = plan({ now: at("2026-11-19T07:05"), items: [item({ title: "School bus payment", dueAt: at("2026-11-19T09:00") })] });
    expect(p?.kind).toBe("morning");
    expect(p?.facts[0]).toContain("School bus payment");
  });
  it("asks about the plan when today is empty", () => {
    expect(plan({ now: at("2026-11-19T07:00") })?.facts[0]).toContain("ask what the plan is today");
  });
  it("only once per day", () => {
    expect(plan({ now: at("2026-11-19T07:10"), user: user({ lastMorningAt: at("2026-11-19T07:00") }) })).toBeNull();
  });
});

describe("night chat (F4)", () => {
  it("fires an hour before sleep and raises what was missed", () => {
    const p = plan({ now: at("2026-11-19T22:05"), items: [item({ title: "Call Hassan", dueAt: at("2026-11-19T15:00") })] });
    expect(p?.kind).toBe("night");
    expect(p?.facts.join(" ")).toContain("Call Hassan");
  });
  it("handles sleep after midnight", () => {
    expect(plan({ now: at("2026-11-20T00:40"), user: user({ sleepTime: "01:30", lastCheckinAt: at("2026-11-20T00:00") }) })?.kind).toBe("night");
  });
});

describe("follow-ups (F6)", () => {
  it("asks how it went after the event", () => {
    const p = plan({ now: at("2026-11-22T20:05"), user: user({ lastCheckinAt: at("2026-11-22T19:00") }), items: [item({ title: "Dentist", dueAt: at("2026-11-22T18:00"), followUpAt: at("2026-11-22T20:00") })] });
    expect(p).toMatchObject({ kind: "followup", itemIds: ["Dentist"] });
  });
  it("skips ones already followed up, and doesn't follow up while asleep", () => {
    const followed = item({ followUpAt: at("2026-11-22T20:00"), followedUpAt: at("2026-11-22T20:01") });
    expect(plan({ now: at("2026-11-22T20:05"), user: user({ lastCheckinAt: at("2026-11-22T19:30") }), items: [followed] })).toBeNull();
    expect(plan({ now: at("2026-11-23T03:00"), items: [item({ followUpAt: at("2026-11-23T02:00") })] })).toBeNull();
  });
});

describe("check-ins (F7)", () => {
  const morning = at("2026-11-19T07:00");
  it("hints at something coming up", () => {
    const p = plan({ now: at("2026-11-19T13:00"), user: user({ lastMorningAt: morning }), items: [item({ title: "4pm meeting", dueAt: at("2026-11-19T16:00") })] });
    expect(p).toMatchObject({ kind: "checkin", itemIds: ["4pm meeting"] });
  });
  it("never outside wake hours", () => {
    expect(plan({ now: at("2026-11-19T04:00"), items: [item({ dueAt: at("2026-11-19T06:00") })] })).toBeNull();
  });
  it("waits for the interval, and longer once slowed down", () => {
    const soon = [item({ dueAt: at("2026-11-19T16:00") })];
    expect(plan({ now: at("2026-11-19T13:00"), user: user({ lastCheckinAt: at("2026-11-19T12:00") }), items: soon })).toBeNull();
    expect(plan({ now: at("2026-11-19T15:00"), user: user({ lastCheckinAt: at("2026-11-19T12:30"), ignoredCheckins: 3 }), items: soon })).toBeNull();
    const p = plan({ now: at("2026-11-19T16:40"), user: user({ lastCheckinAt: at("2026-11-19T12:30"), ignoredCheckins: 3 }), items: [item({ dueAt: at("2026-11-19T18:00") })] });
    expect(p).toMatchObject({ kind: "checkin", slowdownNotice: true });
  });
  it("is off when the user turned it off", () => {
    expect(plan({ now: at("2026-11-19T13:00"), user: user({ checkinIntervalH: "off", lastMorningAt: morning }), items: [item({ dueAt: at("2026-11-19T15:00") })] })).toBeNull();
  });
  it("doesn't interrupt an active conversation", () => {
    expect(plan({ now: at("2026-11-19T13:00"), user: user({ lastUserMessageAt: at("2026-11-19T12:30") }), items: [item({ dueAt: at("2026-11-19T15:00") })] })).toBeNull();
  });
  it("asks a plan question at most once a day when nothing is coming up", () => {
    expect(plan({ now: at("2026-11-19T16:00"), user: user({ lastMorningAt: morning }) })?.facts[0]).toContain("this evening");
    expect(plan({ now: at("2026-11-19T18:30"), user: user({ lastCheckinAt: at("2026-11-19T16:00") }) })).toBeNull();
  });
  it("respects the 3 unprompted questions per day cap", () => {
    expect(plan({ now: at("2026-11-19T13:00"), unpromptedToday: 3, items: [item({ dueAt: at("2026-11-19T15:00") })] })).toBeNull();
  });
});
