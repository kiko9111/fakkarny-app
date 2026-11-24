import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createScreenCache, eachValid } from "./screen-cache";

const memory = () => {
  const m = new Map<string, string>();
  return { m, store: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } };
};
const N = z.object({ n: z.number() });

describe("screen cache", () => {
  it("returns what was saved, parsed again", () => {
    const { store } = memory();
    const c = createScreenCache(store);
    expect(c.get("/circles", N.parse)).toBeNull();
    c.set("/circles", { n: 1 });
    expect(c.get("/circles", N.parse)).toEqual({ n: 1 });
  });
  it("gives null when the saved copy no longer parses", () => {
    const { store } = memory();
    const c = createScreenCache(store);
    c.set("/x", { n: "one" });
    expect(c.get("/x", N.parse)).toBeNull();
  });
  it("keeps only the newest entries and clears everything", () => {
    const { m, store } = memory();
    const c = createScreenCache(store, 2);
    c.set("a", { n: 1 });
    c.set("b", { n: 2 });
    c.set("c", { n: 3 });
    expect(c.get("a", N.parse)).toBeNull();
    expect(c.get("c", N.parse)).toEqual({ n: 3 });
    c.clear();
    expect([...m.keys()]).toEqual([]);
  });
  it("never throws when the store does", () => {
    const c = createScreenCache({ getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); }, removeItem: () => {} });
    c.set("a", 1);
    expect(c.get("a", N.parse)).toBeNull();
  });
});

describe("eachValid", () => {
  it("drops entries that don't fit", () => {
    expect(eachValid(N.safeParse, [{ n: 1 }, { n: "2" }, null, { n: 3 }])).toEqual([{ n: 1 }, { n: 3 }]);
    expect(eachValid(N.safeParse, undefined)).toEqual([]);
  });
});
