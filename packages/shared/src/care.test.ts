import { describe, expect, it } from "vitest";
import { CareMed, CreateCareMedRequest, dosesToAnswer, guessDose, nextDose } from "./care";

const med = (over: Partial<CareMed> = {}): CareMed =>
  CareMed.parse({
    id: "00000000-0000-4000-8000-000000000001",
    circle_id: "00000000-0000-4000-8000-000000000002",
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
    open_missed: [{ due_at: "2026-11-26T18:00:00.000Z", time: "20:00", state: "missed" }],
    ...over,
  });

describe("care", () => {
  it("cleans the times: sorted, once each, at most six", () => {
    expect(CreateCareMedRequest.parse({ circle_id: med().circle_id, person_name: " Mama ", name: "Concor", times: ["20:00", "08:00", "08:00"] })).toMatchObject({ person_name: "Mama", times: ["08:00", "20:00"] });
    const seven = ["01:00", "02:00", "03:00", "04:00", "05:00", "06:00", "07:00"];
    expect(CreateCareMedRequest.safeParse({ circle_id: med().circle_id, person_name: "M", name: "C", times: seven }).success).toBe(false);
    expect(CreateCareMedRequest.safeParse({ circle_id: med().circle_id, person_name: "M", name: "C", times: ["8:00"] }).success).toBe(false);
  });

  it("lists the doses that wait for an answer, oldest first, and the next one", () => {
    expect(dosesToAnswer(med()).map((d) => d.due_at)).toEqual(["2026-11-26T18:00:00.000Z", "2026-11-27T06:00:00.000Z"]);
    expect(dosesToAnswer(med({ active: false }))).toEqual([]);
    expect(nextDose(med())?.time).toBe("20:00");
  });

  it("guesses a mark at once and takes it back", () => {
    const now = new Date("2026-11-27T08:00:00Z");
    const taken = guessDose(med(), "2026-11-26T18:00:00.000Z", "taken", now, "Mona");
    expect(taken.open_missed).toEqual([]);
    const morning = guessDose(med(), "2026-11-27T06:00:00.000Z", "taken", now, "Mona");
    expect(morning.today[0]).toMatchObject({ state: "taken", by_name: "Mona", by_me: true });
    expect(guessDose(morning, "2026-11-27T06:00:00.000Z", "open", now, "Mona").today[0]!.state).toBe("missed");
    expect(guessDose(morning, "2026-11-27T06:00:00.000Z", "open", new Date("2026-11-27T06:30:00Z"), null).today[0]!.state).toBe("due");
  });
});
