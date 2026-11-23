import { describe, expect, it } from "vitest";
import { previewSplit, removePerson, startPeople, toSplitInput, type Draft } from "./logic";

const base: Draft = { title: "", subtotal: "", people: ["Me", "Sara"], items: [], service: false, vat: false, tip: "", paidBy: 0 };

describe("split form", () => {
  it("starts with me and empty rows", () => {
    expect(startPeople("أنا", null)).toEqual(["أنا", ""]);
    expect(startPeople("Me", 4)).toHaveLength(4);
    expect(startPeople("Me", 99)).toHaveLength(30);
  });

  it("needs every name and either a bill or items", () => {
    expect(toSplitInput(base)).toBeNull();
    expect(toSplitInput({ ...base, subtotal: "500", people: ["Me", ""] })).toBeNull();
    expect(previewSplit({ ...base, subtotal: "١٠٠٠" })?.shares).toEqual([500, 500]);
  });

  it("charges each person their items and shares the rest of the bill", () => {
    const p = previewSplit({ ...base, subtotal: "300", items: [{ name: "steak", price: "200", eaters: [0] }, { name: "", price: "", eaters: [] }] });
    expect(p?.shares).toEqual([250, 50]);
    expect(toSplitInput({ ...base, items: [{ name: "x", price: "abc", eaters: [] }] })).toBeNull();
  });

  it("keeps indexes right when someone is removed", () => {
    const d = removePerson({ ...base, people: ["Me", "Sara", "Hoda"], items: [{ name: "a", price: "10", eaters: [1, 2] }], paidBy: 2 }, 1);
    expect(d.people).toEqual(["Me", "Hoda"]);
    expect(d.items[0]!.eaters).toEqual([1]);
    expect(d.paidBy).toBe(1);
  });
});
