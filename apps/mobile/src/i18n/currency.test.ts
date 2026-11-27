import { describe, expect, it } from "vitest";
import { COUNTRIES } from "@fakkarni/shared";
import { withCurrency } from "./currency";
import { strings } from "./strings";

describe("currency words in the app", () => {
  it("leaves Egypt's words as they are", () => {
    const words = strings["ar-EG"];
    expect(withCurrency(words, COUNTRIES.EG.currency)).toBe(words);
  });

  it("swaps pounds for riyals or dirhams everywhere, keeping functions and shape", () => {
    const fn = () => "x";
    const out = withCurrency({ a: "{n} جنيه", b: ["EGP {n}", { c: "المبلغ بالجنيه" }], fn, n: 3 }, COUNTRIES.SA.currency);
    expect(out).toEqual({ a: "{n} ريال", b: ["SAR {n}", { c: "المبلغ بالريال" }], fn, n: 3 });
    const ar = JSON.stringify(withCurrency(strings["ar-EG"], COUNTRIES.AE.currency));
    const en = JSON.stringify(withCurrency(strings.en, COUNTRIES.AE.currency));
    expect(ar).not.toMatch(/جنيه|ج\.م/);
    expect(en).not.toMatch(/\bEGP\b/);
    expect(ar).toContain("درهم");
  });
});
