import { describe, expect, it } from "vitest";
import { addMonths, CreateGameyaRequest, daysToPayDay, monthOfRound, monthsBetween, payDateOf, phaseOf, roundAt, roundState, shownRound, shuffled, type Gameya } from "./gameya";

const book = (over: Partial<Gameya> = {}): Gameya => ({
  id: "g",
  name: "جمعية الشغل",
  amount: 1000,
  currency: "EGP",
  pay_day: 5,
  start_month: "2026-12",
  months: 3,
  pot: 3000,
  circle_id: null,
  circle_name: null,
  code: "ABCD",
  url: "",
  mine: true,
  owner_name: null,
  instapay: null,
  members: [
    { id: "a", name: "كريم", user_id: null, turn: 1, month: "2026-12", received: false, is_me: true },
    { id: "b", name: "منى", user_id: null, turn: 2, month: "2027-01", received: false, is_me: false },
    { id: "c", name: "سارة", user_id: null, turn: 3, month: "2027-02", received: false, is_me: false },
  ],
  payments: [
    { member_id: "a", round: 1 },
    { member_id: "c", round: 1 },
  ],
  round: 1,
  created_at: "2026-11-27T10:00:00.000Z",
  ...over,
});

describe("gam'eya months", () => {
  it("adds months across the year", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-12", 13)).toBe("2028-01");
    expect(addMonths("2027-03", -3)).toBe("2026-12");
    expect(monthsBetween("2026-11", "2027-02")).toBe(3);
  });
  it("maps rounds to months and dates", () => {
    expect(monthOfRound("2026-12", 3)).toBe("2027-02");
    expect(roundAt("2026-12", "2027-01-30")).toBe(2);
    expect(roundAt("2026-12", "2026-11-30")).toBe(0);
    expect(payDateOf("2026-12", 2, 5)).toBe("2027-01-05");
    expect(daysToPayDay({ start_month: "2026-12", pay_day: 5 }, 1, "2026-12-04")).toBe(1);
    expect(daysToPayDay({ start_month: "2026-12", pay_day: 5 }, 1, "2026-12-08")).toBe(-3);
  });
  it("knows the phase and the round to show", () => {
    expect(phaseOf({ round: 0, months: 3 })).toBe("before");
    expect(phaseOf({ round: 3, months: 3 })).toBe("running");
    expect(phaseOf({ round: 4, months: 3 })).toBe("over");
    expect(shownRound({ round: 0, months: 3 })).toBe(1);
    expect(shownRound({ round: 9, months: 3 })).toBe(3);
  });
});

describe("roundState", () => {
  it("says who receives and who still owes", () => {
    const s = roundState(book(), 1);
    expect(s.receiver?.name).toBe("كريم");
    expect(s.unpaid.map((m) => m.name)).toEqual(["منى"]);
    expect(s.collected).toBe(2000);
    expect(s.allPaid).toBe(false);
    expect(roundState(book(), 2).paid).toEqual([]);
  });
});

describe("requests", () => {
  it("needs two members and a pay day every month has", () => {
    const base = { name: "x", amount: 500, pay_day: 1, start_month: "2026-12", members: [{ name: "a" }, { name: "b" }] };
    expect(CreateGameyaRequest.safeParse(base).success).toBe(true);
    expect(CreateGameyaRequest.safeParse({ ...base, members: [{ name: "a" }] }).success).toBe(false);
    expect(CreateGameyaRequest.safeParse({ ...base, pay_day: 31 }).success).toBe(false);
    expect(CreateGameyaRequest.safeParse({ ...base, start_month: "2026-13" }).success).toBe(false);
    expect(CreateGameyaRequest.safeParse({ ...base, amount: 10.5 }).success).toBe(false);
  });
});

describe("shuffled", () => {
  it("keeps every member once", () => {
    let n = 0;
    const out = shuffled([1, 2, 3, 4], () => ((n += 0.37) % 1));
    expect([...out].sort()).toEqual([1, 2, 3, 4]);
  });
});
