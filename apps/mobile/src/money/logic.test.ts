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

import type { MoneyOverview, SectionDetail } from "@fakkarni/shared";
import { detailFromSection, draftEntry, draftSection, overlayDetail, overlayOverview, sameSection, withEntry, withoutSection, withSection } from "./logic";

const now = new Date("2026-11-25T10:00:00Z");
const sec = (id: string, name: string, kind: "expense" | "income" = "expense", extra: object = {}) => ({ ...draftSection({ id, name, kind, budget: null, circle_id: null, circle_name: null }, now), ...extra });
const empty: MoneyOverview = { month: "2026-11", sections: [], totals: { expense: 0, income: 0 } };
const overview = (sections: ReturnType<typeof sec>[]): MoneyOverview => sections.reduce((o, s) => withSection(o, s), empty);

describe("local-first Daftar", () => {
  it("finds a twin section ignoring case and spaces, per kind and book", () => {
    const list = [sec("a", "salary", "income"), sec("b", "Car")];
    expect(sameSection(list, " Salary ", "income", null)?.id).toBe("a");
    expect(sameSection(list, "salary", "expense", null)).toBeNull();
    expect(sameSection(list, "car", "expense", "circle-1")).toBeNull();
    expect(sameSection([sec("c", "مرتّب", "income")], "مرتب", "income", null)?.id).toBe("c");
  });
  it("recounts totals when sections come and go", () => {
    let o = overview([sec("a", "Car", "expense", { month_total: 100, my_share: 100 }), sec("b", "Pay", "income", { month_total: 9000, my_share: 9000 })]);
    expect(o.totals).toEqual({ expense: 100, income: 9000 });
    o = withoutSection(o, "b");
    expect(o.totals).toEqual({ expense: 100, income: 0 });
  });
  it("adds and removes an entry once, moving the total", () => {
    const d: SectionDetail = detailFromSection(sec("a", "Car"));
    const e = draftEntry({ id: "e1", section_id: "a", amount: 250, note: "gas", split_count: 1 }, now);
    const added = withEntry(d, e);
    expect(added.section.month_total).toBe(250);
    expect(withEntry(added, e).entries).toHaveLength(1);
    expect(withEntry(added, e, -1).section.month_total).toBe(0);
  });
  it("counts only your part of a shared book", () => {
    const d: SectionDetail = detailFromSection(sec("a", "Home", "expense", { circle_id: "c1" }));
    const e = draftEntry({ id: "e1", section_id: "a", amount: 300, note: null, split_count: 3 }, now);
    const added = withEntry(d, e);
    expect(added.section.month_total).toBe(300);
    expect(added.section.my_share).toBe(100);
  });
  it("lays waiting writes over the server's copy", () => {
    const o = overview([sec("a", "Car")]);
    const waiting = [
      { method: "POST", path: "/money/sections", body: { id: "n1", name: "Salary", kind: "income" }, at: now.toISOString() },
      { method: "POST", path: "/money/sections/n1/entries", body: { id: "e1", amount: 9000 }, at: now.toISOString() },
      { method: "POST", path: "/money/sections/a/entries", body: { id: "e2", amount: 50 }, at: now.toISOString() },
    ];
    const out = overlayOverview(o, waiting);
    expect(out.sections.map((s) => s.id)).toEqual(["a", "n1"]);
    expect(out.totals).toEqual({ expense: 50, income: 9000 });
    // Already on the server: not added twice.
    expect(overlayOverview(withSection(o, sec("n1", "Salary", "income")), waiting.slice(0, 1)).sections).toHaveLength(2);
    const d = overlayDetail(detailFromSection(o.sections[0]!), [...waiting, { method: "DELETE", path: "/money/entries/zz", at: now.toISOString() }]);
    expect(d.entries.map((e) => e.id)).toEqual(["e2"]);
    expect(d.section.month_total).toBe(50);
  });
});
