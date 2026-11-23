import { describe, expect, it } from "vitest";
import { previewSplit, removePerson, startPeople, toSplitInput, type Draft, daftarFromSplit } from "./logic";

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

describe("daftarFromSplit", () => {
  const people = [
    { name: "أنا", share: 300, paid: true },
    { name: "منى", share: 250, paid: false },
    { name: "عمر", share: 200, paid: true },
    { name: "", share: 100, paid: false },
  ];
  it("turns what friends still owe me into entries", () => {
    expect(daftarFromSplit({ title: "عشا", paid_by: 0, people }, "قسمة")).toEqual([{ other_name: "منى", direction: "owed_to_me", amount: 250, note: "قسمة: عشا" }]);
  });
  it("records my share when someone else paid, and nothing without a payer", () => {
    const mine = people.map((p, i) => (i === 0 ? { ...p, paid: false } : p));
    expect(daftarFromSplit({ title: "", paid_by: 2, people: mine }, "Split")).toEqual([{ other_name: "عمر", direction: "i_owe", amount: 300, note: "Split" }]);
    expect(daftarFromSplit({ title: "", paid_by: null, people }, "Split")).toEqual([]);
  });
});
