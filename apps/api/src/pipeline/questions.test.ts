import { describe, expect, it } from "vitest";
import { readQuestion } from "./questions";

describe("readQuestion", () => {
  it("reads questions about the user's own data", () => {
    expect(readQuestion("What do I have this week?")).toEqual({ kind: "plans", range: "week" });
    expect(readQuestion("عندي ايه بكره؟")).toEqual({ kind: "plans", range: "tomorrow" });
    expect(readQuestion("3andy eh enaharda")).toEqual({ kind: "plans", range: "today" });
    expect(readQuestion("sagelt kam ?")).toEqual({ kind: "money" });
    expect(readQuestion("صرفت كام الشهر ده")).toEqual({ kind: "money" });
    expect(readQuestion("how much did I spend this month?")).toEqual({ kind: "money" });
    expect(readQuestion("shrbt kam kobaya")).toEqual({ kind: "trackers" });
    expect(readQuestion("مين عليه فلوس ليا")).toEqual({ kind: "daftar" });
    expect(readQuestion("who owes me?")).toEqual({ kind: "daftar" });
  });

  it("leaves logs, requests and small talk alone", () => {
    for (const t of ["صرفت 300 بنزين", "sagelt 500 fel akl", "shrbt maya", "fakarny bokra el sa3a 6", "3amel eh ya zaki", "remind me to plan the trip", "?", "ahh"]) {
      expect(readQuestion(t), t).toBeNull();
    }
  });
});
