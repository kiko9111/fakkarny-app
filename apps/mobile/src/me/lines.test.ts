import { describe, expect, it } from "vitest";
import { countLine, joinLine, planLine, planNow, nextPrayer } from "./lines";

const now = new Date("2026-11-27T10:00:00Z");
const base = { pro: false, plan: "none" as const, plan_tier: "pro" as const, plan_expires_at: null, bonus_pro_until: null };
const words = { planFree: "Free plan", planPro: "Zaki Pro", planFamily: "Zaki Family", planUntil: "{plan} until {date}" };
const day = (iso: string) => iso.slice(0, 10);

describe("planNow", () => {
  it("is free with no profile yet, and when Pro is off", () => {
    expect(planNow(null, now)).toEqual({ kind: "free", until: null });
    expect(planNow(base, now)).toEqual({ kind: "free", until: null });
    // Invite days that ran out: the server says pro false, the old date is not shown.
    expect(planNow({ ...base, bonus_pro_until: "2026-11-01T00:00:00Z" }, now).until).toBeNull();
  });

  it("shows no end date on a paid plan, which renews", () => {
    expect(planNow({ ...base, pro: true, plan: "yearly", plan_expires_at: "2027-01-01T00:00:00Z" }, now)).toEqual({ kind: "pro", until: null });
    expect(planNow({ ...base, pro: true, plan: "monthly", plan_tier: "family" }, now)).toEqual({ kind: "family", until: null });
  });

  it("shows when invite days or a trial end, the later of the two", () => {
    expect(planNow({ ...base, pro: true, bonus_pro_until: "2026-12-04T00:00:00Z" }, now).until).toBe("2026-12-04T00:00:00Z");
    expect(planNow({ ...base, pro: true, plan: "trial", plan_expires_at: "2026-12-10T00:00:00Z", bonus_pro_until: "2026-12-04T00:00:00Z" }, now).until).toBe("2026-12-10T00:00:00Z");
  });

  it("has no date for someone covered by a Family plan, or an expired plan with days left over", () => {
    expect(planNow({ ...base, pro: true }, now)).toEqual({ kind: "pro", until: null });
    expect(planNow({ ...base, pro: true, plan: "expired", plan_expires_at: "2026-12-30T00:00:00Z" }, now).until).toBeNull();
  });
});

describe("planLine", () => {
  it("names the plan, with the date only when there is one", () => {
    expect(planLine({ kind: "free", until: null }, words, day)).toBe("Free plan");
    expect(planLine({ kind: "family", until: null }, words, day)).toBe("Zaki Family");
    expect(planLine({ kind: "pro", until: "2026-12-04T00:00:00Z" }, words, day)).toBe("Zaki Pro until 2026-12-04");
  });
});

describe("row values", () => {
  it("counts with a word for one and nothing for none", () => {
    expect(countLine(0, "1 alarm", "{n} alarms")).toBeNull();
    expect(countLine(1, "1 alarm", "{n} alarms")).toBe("1 alarm");
    expect(countLine(3, "1 alarm", "{n} alarms")).toBe("3 alarms");
  });

  it("joins what there is, and gives no line for nothing", () => {
    expect(joinLine(["2 alarms", null, "1 place"])).toBe("2 alarms · 1 place");
    expect(joinLine([null, undefined])).toBeUndefined();
  });
});

describe("nextPrayer", () => {
  const at = (h: number) => new Date(Date.UTC(2026, 10, 28, h));
  const times = { fajr: at(3), sunrise: at(4), dhuhr: at(10), asr: at(13), maghrib: at(15), isha: at(16) };
  const order = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"] as const;

  it("is the first prayer still ahead, never sunrise", () => {
    expect(nextPrayer(times, order, new Date(Date.UTC(2026, 10, 28, 3, 30)))?.name).toBe("dhuhr");
    expect(nextPrayer(times, order, at(14))?.name).toBe("maghrib");
  });

  it("is nothing after Isha", () => {
    expect(nextPrayer(times, order, at(17))).toBeNull();
  });
});
