import { describe, expect, it } from "vitest";
import { draftRequest, localDay, moveTurn, newDraft, startChoices, wholePounds, withCircle } from "./logic";

const me = { name: "Kareem", userId: "u1" };

describe("gam'eya form", () => {
  it("offers this month and the next two, starting next month", () => {
    expect(startChoices("2026-12-27")).toEqual(["2026-12", "2027-01", "2027-02"]);
    expect(newDraft("2026-12-27", me).start).toBe("2027-01");
    expect(localDay(new Date(2026, 0, 5, 23, 0))).toBe("2026-01-05");
  });
  it("needs a name, whole pounds and two people", () => {
    const d = { ...newDraft("2026-11-27", me), name: "Work", amount: "1,000" };
    expect(draftRequest(d, "id")).toBeNull();
    const ready = { ...d, people: [me, { name: " Mona ", userId: null }, { name: "", userId: null }] };
    expect(draftRequest(ready, "id")).toEqual({ id: "id", name: "Work", amount: 1000, pay_day: 1, start_month: "2026-12", circle_id: null, members: [{ name: "Kareem", user_id: "u1" }, { name: "Mona", user_id: null }] });
    expect(wholePounds("١٥٠٠")).toBe(1500);
    expect(wholePounds("10.5")).toBeNull();
  });
  it("takes a circle's members as turns and keeps typed names", () => {
    const d = { ...newDraft("2026-11-27", me), people: [me, { name: "Sara", userId: null }] };
    const c = withCircle(d, { id: "c1", members: [{ user_id: "u1", name: "Kareem" }, { user_id: "u2", name: "Mona" }, { user_id: "u3", name: null }] }, me, (n) => `Person ${n}`);
    expect(c.people).toEqual([me, { name: "Mona", userId: "u2" }, { name: "Person 3", userId: "u3" }, { name: "Sara", userId: null }]);
    expect(withCircle(c, null, me, String).people).toEqual([me, { name: "Sara", userId: null }]);
  });
  it("moves a turn", () => {
    expect(moveTurn(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(moveTurn(["a", "b"], 0, -1)).toEqual(["a", "b"]);
  });
});
