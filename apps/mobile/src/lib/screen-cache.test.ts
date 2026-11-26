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

describe("screen cache: memory first", () => {
  it("hands back the very same object while the answer has not changed", () => {
    const { store } = memory();
    const c = createScreenCache(store);
    expect(c.put("/tasks", '{"n":1}')).toBe(true);
    const one = c.get("/tasks", N.parse);
    expect(c.put("/tasks", '{"n":1}')).toBe(false);
    expect(c.get("/tasks", N.parse)).toBe(one);
    expect(c.put("/tasks", '{"n":2}')).toBe(true);
    expect(c.get("/tasks", N.parse)).toEqual({ n: 2 });
    expect(c.get("/tasks", N.parse)).not.toBe(one);
  });

  it("reads storage once per key, and parses once per answer", () => {
    const { m, store } = memory();
    m.set("screen:/me", '{"n":7}');
    let reads = 0;
    let parses = 0;
    const c = createScreenCache({ ...store, getItem: (k) => (reads++, store.getItem(k)) });
    const parse = (raw: unknown) => (parses++, N.parse(raw));
    for (let i = 0; i < 5; i++) expect(c.get("/me", parse)).toEqual({ n: 7 });
    for (let i = 0; i < 5; i++) expect(c.get("/nothing", parse)).toBeNull();
    expect(reads).toBe(2);
    expect(parses).toBe(1);
  });

  it("saves to storage later, together, and only what changed", () => {
    const { m, store } = memory();
    const writes: string[] = [];
    let run: (() => void) | null = null;
    const c = createScreenCache({ ...store, setItem: (k, v) => (writes.push(k), store.setItem(k, v)) }, { later: (save) => (run = save) });
    c.put("/a", '{"n":1}');
    c.put("/b", '{"n":2}');
    c.put("/a", '{"n":3}');
    // On screen at once, not yet in storage.
    expect(c.get("/a", N.parse)).toEqual({ n: 3 });
    expect(writes).toEqual([]);
    run!();
    expect(m.get("screen:/a")).toBe('{"n":3}');
    expect(m.get("screen:/b")).toBe('{"n":2}');
    expect(writes.sort()).toEqual(["screen-index", "screen:/a", "screen:/b"]);
    // The same answers again: nothing to save.
    writes.length = 0;
    run = null;
    c.put("/a", '{"n":3}');
    c.put("/b", '{"n":2}');
    expect(run).toBeNull();
    expect(writes).toEqual([]);
  });

  it("a later instance finds what an earlier one saved", () => {
    const { store } = memory();
    const first = createScreenCache(store);
    first.put("/circles", '{"n":4}');
    first.set("/me", { n: 5 });
    const second = createScreenCache(store);
    expect(second.get("/circles", N.parse)).toEqual({ n: 4 });
    expect(second.get("/me", N.parse)).toEqual({ n: 5 });
    expect(second.text("/circles")).toBe('{"n":4}');
  });

  it("knows how fresh a copy is: only answers from the server count, until something changes", () => {
    const { m, store } = memory();
    m.set("screen:/old", '{"n":1}');
    let t = 1_000;
    const c = createScreenCache(store, { now: () => t });
    expect(c.get("/old", N.parse)).toEqual({ n: 1 });
    expect(c.age("/old")).toBe(Infinity);
    c.set("/mine", { n: 2 });
    expect(c.age("/mine")).toBe(Infinity);
    c.put("/tasks", '{"n":3}');
    t += 2_500;
    expect(c.age("/tasks")).toBe(2_500);
    // The same answer again counts as fresh again.
    c.put("/tasks", '{"n":3}');
    expect(c.age("/tasks")).toBe(0);
    c.stale();
    expect(c.age("/tasks")).toBe(Infinity);
    expect(c.get("/tasks", N.parse)).toEqual({ n: 3 });
  });

  it("removes a copy from memory and from storage", () => {
    const { m, store } = memory();
    const c = createScreenCache(store);
    c.put("/circles/1", '{"n":1}');
    c.remove("/circles/1");
    expect(c.get("/circles/1", N.parse)).toBeNull();
    expect(m.has("screen:/circles/1")).toBe(false);
    expect(JSON.parse(m.get("screen-index")!)).toEqual([]);
    c.put("/circles/1", '{"n":2}');
    expect(c.get("/circles/1", N.parse)).toEqual({ n: 2 });
  });

  it("a copy that does not parse throws from read and is null from get", () => {
    const { store } = memory();
    const c = createScreenCache(store);
    c.put("/x", '{"n":"one"}');
    expect(c.get("/x", N.parse)).toBeNull();
    expect(() => c.read("/x", N.parse)).toThrow();
    expect(c.read("/none", N.parse)).toBeNull();
  });
});

describe("screen cache: what is dropped first", () => {
  it("keeps a screen that is still read though it never changes", () => {
    const { store } = memory();
    const c = createScreenCache(store, 4);
    c.put("/me", '{"n":0}');
    for (const k of ["a", "b", "c"]) c.put(k, '{"n":1}');
    // The same answer for /me again: in use, so it must not be the next one out.
    c.put("/me", '{"n":0}');
    c.put("d", '{"n":2}');
    expect(c.get("/me", N.parse)).toEqual({ n: 0 });
    expect(c.get("a", N.parse)).toBeNull();
  });
  it("leaves nothing in storage after a clear, also what was dropped a moment before", () => {
    const { m, store } = memory();
    const saves: (() => void)[] = [];
    const c = createScreenCache(store, { max: 2, later: (save) => void saves.push(save) });
    c.put("a", '{"n":1}');
    c.put("b", '{"n":2}');
    saves.splice(0).forEach((save) => save());
    // "a" falls off the list; its removal from storage still waits.
    c.put("c", '{"n":3}');
    expect(m.has("screen:a")).toBe(true);
    c.clear();
    saves.splice(0).forEach((save) => save());
    expect([...m.keys()]).toEqual([]);
  });
});

describe("eachValid", () => {
  it("drops entries that don't fit", () => {
    expect(eachValid(N.safeParse, [{ n: 1 }, { n: "2" }, null, { n: 3 }])).toEqual([{ n: 1 }, { n: 3 }]);
    expect(eachValid(N.safeParse, undefined)).toEqual([]);
  });
});
