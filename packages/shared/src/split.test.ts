import { describe, expect, it } from "vitest";
import { parseSplitAsk, splitBill, SplitInput } from "./split";

const people = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `p${i}` }));
const math = (over: Partial<Parameters<typeof splitBill>[0]>) => splitBill({ people: people(3), items: [], subtotal: null, service_pct: 12, vat_pct: 14, vat_on_service: true, tip: 0, ...over });

describe("split the check", () => {
  it("charges each person their own items, with service and VAT in proportion", () => {
    const r = math({ service_pct: 0, vat_pct: 0, items: [{ name: "steak", price: 300, eaters: [0] }, { name: "salad", price: 100, eaters: [1] }, { name: "fries", price: 60, eaters: [] }] });
    expect(r.shares).toEqual([320, 120, 20]);
    const taxed = math({ items: [{ name: "steak", price: 300, eaters: [0] }, { name: "juice", price: 100, eaters: [1, 2] }] });
    // 300 × 1.12 × 1.14 = 383.04; 50 × 1.2768 = 63.84 each.
    expect(taxed.shares).toEqual([383, 64, 64]);
    expect(taxed.total).toBe(511);
  });

  it("can charge VAT on the bill only", () => {
    const r = math({ people: people(2), items: [{ name: "x", price: 100, eaters: [0] }, { name: "y", price: 100, eaters: [1] }], vat_on_service: false });
    // 100 + 12 + 14 = 126 each.
    expect(r.shares).toEqual([126, 126]);
  });

  it("splits a quick bill evenly when there are no items", () => {
    const r = math({ people: people(4), subtotal: 1000 });
    expect(r.service).toBe(120);
    expect(r.vat).toBe(157);
    expect(r.total).toBe(1277);
    expect(r.shares.reduce((a, b) => a + b, 0)).toBe(1277);
  });

  it("always adds up to the total, whatever the rounding", () => {
    for (const n of [2, 3, 7, 11]) {
      const r = math({ people: people(n), items: [{ name: "a", price: 123.45, eaters: [0] }, { name: "b", price: 99.99, eaters: [] }], tip: 50 });
      expect(r.shares.reduce((a, b) => a + b, 0)).toBe(r.total);
    }
  });

  it("shares what the items don't cover of a typed bill", () => {
    const r = math({ service_pct: 0, vat_pct: 0, people: people(2), subtotal: 300, items: [{ name: "steak", price: 200, eaters: [0] }] });
    expect(r.shares).toEqual([250, 50]);
    const over = math({ service_pct: 0, vat_pct: 0, people: people(2), subtotal: 100, items: [{ name: "steak", price: 200, eaters: [0] }] });
    expect(over.shares).toEqual([200, 0]);
  });

  it("ignores eaters who are not in the list", () => {
    const r = math({ service_pct: 0, vat_pct: 0, people: people(2), items: [{ name: "a", price: 100, eaters: [7] }] });
    expect(r.shares).toEqual([50, 50]);
  });

  it("fills Egypt's defaults and refuses a one-person split", () => {
    const v = SplitInput.parse({ people: [{ name: "a" }, { name: "b" }], subtotal: 500 });
    expect([v.service_pct, v.vat_pct, v.vat_on_service]).toEqual([12, 14, true]);
    expect(SplitInput.safeParse({ subtotal: 500, people: [{ name: "a" }] }).success).toBe(false);
  });

  it("reads a split ask from the chat", () => {
    expect(parseSplitAsk("احسبلي ١٨٥٠ على ٥")).toEqual({ subtotal: 1850, people: 5 });
    expect(parseSplitAsk("split 1,200 between 4")).toEqual({ subtotal: 1200, people: 4 });
    expect(parseSplitAsk("احسبلي الحساب")).toEqual({ subtotal: null, people: null });
    expect(parseSplitAsk("فكرني أدفع النور")).toBeNull();
  });
});
