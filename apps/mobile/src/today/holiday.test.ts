import { describe, expect, it } from "vitest";
import { holidayNote } from "./holiday";

describe("holiday on Today", () => {
  it("names a holiday that runs today, else one that starts tomorrow", () => {
    expect(holidayNote("cairo", "2027-03-10", "en")).toEqual({ when: "today", name: "Eid al-Fitr" });
    expect(holidayNote("cairo", "2027-03-08", "ar")).toEqual({ when: "tomorrow", name: "عيد الفطر" });
    expect(holidayNote("dubai", "2026-12-01", "en")).toEqual({ when: "today", name: "Commemoration Day" });
  });

  it("says nothing on a plain day or without a picked city", () => {
    expect(holidayNote("cairo", "2027-03-20", "en")).toBeNull();
    expect(holidayNote(null, "2027-03-10", "en")).toBeNull();
  });
});
