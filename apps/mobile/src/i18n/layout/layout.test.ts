import { describe, expect, it } from "vitest";
import { layoutAreas } from "./index";

const keys = (o: object, prefix = ""): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" && !Array.isArray(v) ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));

describe("layout strings", () => {
  it.each(Object.entries(layoutAreas))("%s has the same keys in both languages, none empty", (_name, table) => {
    expect(keys(table.en).sort()).toEqual(keys(table["ar-EG"]).sort());
    for (const lang of ["en", "ar-EG"] as const) expect(JSON.stringify(table[lang])).not.toContain('""');
  });
  it("writes numbers with Latin digits in Arabic", () => {
    for (const table of Object.values(layoutAreas)) expect(JSON.stringify(table["ar-EG"])).not.toMatch(/[٠-٩]/);
  });
});
