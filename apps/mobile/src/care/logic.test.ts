import { describe, expect, it } from "vitest";
import { CareMed } from "@fakkarni/shared";
import { canTap, careSummary, careToAnswer, toggleTime } from "./logic";

const C = "00000000-0000-4000-8000-0000000000c1";
const med = (id: string, over: object = {}) =>
  CareMed.parse({
    id: `00000000-0000-4000-8000-00000000000${id}`,
    circle_id: C,
    person_name: "Mama",
    name: "Concor",
    times: ["08:00", "20:00"],
    time_zone: "Africa/Cairo",
    missed_after_minutes: 60,
    active: true,
    created_at: "2026-11-20T10:00:00.000Z",
    today: [
      { due_at: "2026-11-27T06:00:00.000Z", time: "08:00", state: "missed" },
      { due_at: "2026-11-27T18:00:00.000Z", time: "20:00", state: "later" },
    ],
    ...over,
  });

describe("care on the phone", () => {
  it("toggles times in order, at most six", () => {
    expect(toggleTime(["20:00"], "08:00")).toEqual(["08:00", "20:00"]);
    expect(toggleTime(["08:00", "20:00"], "08:00")).toEqual(["20:00"]);
    expect(toggleTime(["01:00", "02:00", "03:00", "04:00", "05:00", "06:00"], "07:00")).toHaveLength(6);
  });

  it("sums a circle's tile, skipping paused medicines and other circles", () => {
    const meds = [med("1"), med("2", { today: [{ due_at: "2026-11-27T12:00:00.000Z", time: "14:00", state: "due" }] }), med("3", { active: false }), med("4", { circle_id: "00000000-0000-4000-8000-0000000000c2" })];
    expect(careSummary(meds, C)).toEqual({ count: 3, left: 2, missed: 1, next: "14:00" });
    expect(careSummary(null, C)).toEqual({ count: 0, left: 0, missed: 0, next: null });
  });

  it("lists every dose nobody marked, oldest first", () => {
    const meds = [med("1", { open_missed: [{ due_at: "2026-11-26T18:00:00.000Z", time: "20:00", state: "missed" }] }), med("2")];
    expect(careToAnswer(meds).map((x) => [x.med.id.at(-1), x.dose.due_at])).toEqual([
      ["1", "2026-11-26T18:00:00.000Z"],
      ["1", "2026-11-27T06:00:00.000Z"],
      ["2", "2026-11-27T06:00:00.000Z"],
    ]);
  });

  it("taps a dose from an hour before to a day after", () => {
    const dose = { due_at: "2026-11-27T18:00:00.000Z", time: "20:00", state: "later" as const, by_name: null, by_me: false, marked_at: null };
    expect(canTap(dose, new Date("2026-11-27T16:30:00Z"))).toBe(false);
    expect(canTap(dose, new Date("2026-11-27T17:30:00Z"))).toBe(true);
    expect(canTap(dose, new Date("2026-11-28T18:30:00Z"))).toBe(false);
  });
});
