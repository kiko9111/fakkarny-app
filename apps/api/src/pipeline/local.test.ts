import { describe, expect, it } from "vitest";
import { helplineFor } from "../persona/prompt";
import { describeLocal } from "./local";

describe("local context", () => {
  it("tells the model the city, money, prayer times and holidays", () => {
    const lines = describeLocal("dubai", "Asia/Dubai", new Date("2026-11-27T08:00:00Z"));
    expect(lines[0]).toBe('LOCAL: Dubai, UAE; money is AED: write amounts as "120 درهم" in Arabic, "AED 120" in English.');
    expect(lines[1]).toMatch(/^PRAYER TIMES today \(about, local\): Fajr 05:2\d, Sunrise 06:4\d, Dhuhr 12:0\d, Asr 15:0\d, Maghrib 17:2\d, Isha 18:5\d\./);
    expect(lines[2]).toContain("Wed 2026-12-02 National Day (2 days)");
  });

  it("assumes the time zone's city for prayer times, but keeps pounds until a city is picked", () => {
    const lines = describeLocal(null, "Asia/Riyadh", new Date("2026-11-19T08:00:00Z"));
    expect(lines[0]).toContain("Riyadh, Saudi Arabia (assumed from the time zone");
    expect(lines[0]).toContain("money is EGP");
    expect(lines).toHaveLength(2); // no Saudi holiday in the next 30 days
  });

  it("says only the money when nothing is known", () => {
    expect(describeLocal(null, "Europe/London", new Date())).toEqual(['LOCAL: city not picked; money is EGP: write amounts as "120 جنيه" in Arabic, "EGP 120" in English.']);
  });

  it("marks moon-based days as expected", () => {
    const lines = describeLocal("cairo", "Africa/Cairo", new Date("2027-02-20T08:00:00Z"));
    expect(lines.at(-1)).toContain("Tue 2027-03-09 Eid al-Fitr (3 days) (expected)");
  });

  it("gives the helpline of the picked city's country first", () => {
    expect(helplineFor("Africa/Cairo")).toContain("16328");
    expect(helplineFor("Africa/Cairo", "riyadh")).toContain("Saudi Arabia");
    expect(helplineFor("Europe/London", "dubai")).toContain("UAE");
    expect(helplineFor("Europe/London", null)).toContain("local emergency services");
  });
});
