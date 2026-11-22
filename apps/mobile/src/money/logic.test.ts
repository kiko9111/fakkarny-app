import { describe, expect, it } from "vitest";
import { budgetState, groupSections, monthLabel, toggleSplit } from "./logic";

describe("spending helpers", () => {
  it("shows the budget as a share, near and over", () => {
    expect(budgetState({ budget: 1000, month_total: 850, my_share: 850, circle_id: null })).toEqual({ value: 0.85, over: false, near: true });
    expect(budgetState({ budget: 1000, month_total: 1200, my_share: 1200, circle_id: null })).toEqual({ value: 1, over: true, near: true });
    expect(budgetState({ budget: null, month_total: 5, my_share: 5, circle_id: null })).toBeNull();
  });
  it("labels a month", () => {
    expect(monthLabel("2026-11", "en-US")).toBe("November 2026");
  });
  it("groups personal sections and shared books", () => {
    const g = groupSections([
      { id: "pay", circle_id: null, kind: "income", created_at: "2026-11-01T00:00:00Z" },
      { id: "home", circle_id: "c1", kind: "expense", created_at: "2026-11-02T00:00:00Z" },
      { id: "car", circle_id: null, kind: "expense", created_at: "2026-11-03T00:00:00Z" },
    ]);
    expect(g.own.map((s) => s.id)).toEqual(["car", "pay"]);
    expect(g.shared.map((s) => s.id)).toEqual(["home"]);
  });
  it("never empties a split", () => {
    expect(toggleSplit(["a", "b"], "a")).toEqual(["b"]);
    expect(toggleSplit(["b"], "b")).toEqual(["b"]);
    expect(toggleSplit(["b"], "c")).toEqual(["b", "c"]);
  });
});
