import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createScreenCache } from "./screen-cache";
import { createSavedReads } from "./saved-reads";

const N = z.object({ n: z.number() });
const parse = (raw: unknown) => N.parse(raw);

/** A server whose answers are released by hand, so the order of arrival is the test's choice. */
function setup(freshMs = 5_000) {
  const m = new Map<string, string>();
  let t = 10_000;
  const cache = createScreenCache({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) }, { now: () => t });
  const calls: { path: string; answer: (text: string) => void; fail: (err: Error) => void }[] = [];
  const reads = createSavedReads({
    cache,
    freshMs,
    fetchText: (path) => new Promise<string>((answer, fail) => calls.push({ path, answer, fail })),
  });
  return { reads, cache, calls, stored: m, pass: (ms: number) => (t += ms) };
}

describe("saved reads", () => {
  it("asks the server once for callers that overlap, and hands all of them the same object", async () => {
    const { reads, calls } = setup();
    const one = reads.get("/tasks", parse);
    const two = reads.get("/tasks", parse);
    expect(calls).toHaveLength(1);
    calls[0]!.answer('{"n":1}');
    expect(await one).toEqual({ n: 1 });
    expect(await two).toBe(await one);
  });

  it("uses a copy the server just confirmed, then asks again once it is old", async () => {
    const { reads, calls, pass } = setup(5_000);
    const first = reads.get("/me", parse);
    calls[0]!.answer('{"n":1}');
    await first;
    expect(await reads.get("/me", parse)).toEqual({ n: 1 });
    expect(calls).toHaveLength(1);
    pass(6_000);
    const later = reads.get("/me", parse);
    expect(calls).toHaveLength(2);
    calls[1]!.answer('{"n":1}');
    // The same answer: the same object, so the screen does not redraw.
    expect(await later).toBe(await first);
  });

  it("asks again after a change, however recent the copy", async () => {
    const { reads, calls } = setup();
    const first = reads.get("/circles", parse);
    calls[0]!.answer('{"n":1}');
    await first;
    reads.changed();
    const again = reads.get("/circles", parse);
    expect(calls).toHaveLength(2);
    calls[1]!.answer('{"n":2}');
    expect(await again).toEqual({ n: 2 });
  });

  it("does not trust an answer that was on its way when something changed", async () => {
    const { reads, calls } = setup();
    const before = reads.get("/tasks", parse);
    // The user taps (a write) while the read is on its way; the screen reloads after the write.
    reads.changed();
    const after = reads.get("/tasks", parse);
    expect(calls).toHaveLength(2);
    // The newer request answers first, then the old one arrives late with the old state.
    calls[1]!.answer('{"n":2}');
    expect(await after).toEqual({ n: 2 });
    calls[0]!.answer('{"n":1}');
    expect(await before).toEqual({ n: 2 });
    expect(await reads.get("/tasks", parse)).toEqual({ n: 2 });
    expect(calls).toHaveLength(2);
  });

  it("keeps an old answer that arrives after a change, but asks again", async () => {
    const { reads, calls } = setup();
    const before = reads.get("/tasks", parse);
    reads.changed();
    calls[0]!.answer('{"n":1}');
    expect(await before).toEqual({ n: 1 });
    // Kept (better than nothing), not fresh: the next read goes to the server.
    const next = reads.get("/tasks", parse);
    expect(calls).toHaveLength(2);
    calls[1]!.answer('{"n":2}');
    expect(await next).toEqual({ n: 2 });
  });

  it("an answer that does not parse is not kept, and the last good copy stays", async () => {
    const { reads, calls, pass } = setup(1_000);
    const good = reads.get("/money", parse);
    calls[0]!.answer('{"n":1}');
    await good;
    pass(2_000);
    const bad = reads.get("/money", parse);
    calls[1]!.answer('{"n":"lots"}');
    await expect(bad).rejects.toThrow();
    expect(reads.peek("/money", parse)).toEqual({ n: 1 });
  });

  it("passes a failed request on to everyone who waited for it, and tries again next time", async () => {
    const { reads, calls } = setup();
    const one = reads.get("/daftar", parse);
    const two = reads.get("/daftar", parse);
    calls[0]!.fail(new Error("offline"));
    await expect(one).rejects.toThrow("offline");
    await expect(two).rejects.toThrow("offline");
    const again = reads.get("/daftar", parse);
    expect(calls).toHaveLength(2);
    calls[1]!.answer('{"n":3}');
    expect(await again).toEqual({ n: 3 });
  });
});

describe("saved reads: every tab in one answer", () => {
  const parserFor = (path: string) => (path.startsWith("/unknown") ? null : parse);

  it("fills every copy, so a tab opened right after needs no request", async () => {
    const { reads, calls } = setup();
    expect(await reads.all(async () => ({ "/me": '{"n":1}', "/tasks": '{"n":2}' }), parserFor)).toBe(true);
    expect(await reads.get("/me", parse)).toEqual({ n: 1 });
    expect(await reads.get("/tasks", parse)).toEqual({ n: 2 });
    expect(calls).toHaveLength(0);
  });

  it("says nothing changed when every part is the copy already held", async () => {
    const { reads } = setup();
    await reads.all(async () => ({ "/me": '{"n":1}' }), parserFor);
    const held = reads.peek("/me", parse);
    expect(await reads.all(async () => ({ "/me": '{"n":1}' }), parserFor)).toBe(false);
    expect(reads.peek("/me", parse)).toBe(held);
    expect(await reads.all(async () => ({ "/me": '{"n":5}' }), parserFor)).toBe(true);
  });

  it("a part that does not fit this build leaves the last good copy alone; unknown paths are skipped", async () => {
    const { reads, cache } = setup();
    await reads.all(async () => ({ "/trackers": '{"n":1}' }), parserFor);
    expect(await reads.all(async () => ({ "/trackers": '{"n":"new shape"}', "/unknown/thing": '{"n":9}' }), parserFor)).toBe(false);
    expect(reads.peek("/trackers", parse)).toEqual({ n: 1 });
    expect(cache.text("/unknown/thing")).toBeNull();
  });

  it("'nothing changed' makes the copies fresh again, except one that moved on since", async () => {
    const { reads, calls, pass } = setup(5_000);
    await reads.all(async () => ({ "/me": '{"n":1}', "/tasks": '{"n":2}' }), parserFor);
    pass(60_000);
    // Meanwhile the tasks screen read a newer answer by itself.
    const own = reads.get("/tasks", parse);
    calls[0]!.answer('{"n":3}');
    await own;
    pass(60_000);
    expect(await reads.all(async () => "same", parserFor)).toBe(false);
    expect(await reads.get("/me", parse)).toEqual({ n: 1 });
    expect(calls).toHaveLength(1);
    void reads.get("/tasks", parse);
    expect(calls).toHaveLength(2);
  });

  it("reports a server without the route, and never trusts an answer that crossed a change", async () => {
    const { reads, calls } = setup();
    expect(await reads.all(async () => null, parserFor)).toBeNull();
    let release!: (parts: Record<string, string>) => void;
    const going = reads.all(() => new Promise((r) => (release = r)), parserFor);
    reads.changed();
    release({ "/me": '{"n":1}' });
    expect(await going).toBe(true);
    // Kept, but the next read asks the server.
    expect(reads.peek("/me", parse)).toEqual({ n: 1 });
    void reads.get("/me", parse);
    expect(calls).toHaveLength(1);
  });

  it("a write's answer put into a copy is drawn at once, is not fresh, and outlives a read asked before it", async () => {
    const { reads, calls } = setup();
    const first = reads.get("/trackers", parse);
    calls[0]!.answer('{"n":1}');
    await first;
    // A reload leaves, the user taps, the tap's answer lands first.
    reads.changed();
    const reload = reads.get("/trackers", parse);
    reads.set("/trackers", { n: 2 });
    expect(reads.peek("/trackers", parse)).toEqual({ n: 2 });
    calls[1]!.answer('{"n":1}');
    expect(await reload).toEqual({ n: 2 });
    // Not fresh: the next read asks the server, and its answer is taken.
    const next = reads.get("/trackers", parse);
    expect(calls).toHaveLength(3);
    calls[2]!.answer('{"n":3}');
    expect(await next).toEqual({ n: 3 });
  });

  it("after sign-out nothing of the last person is kept, not even an answer still on its way", async () => {
    const { reads, calls, stored } = setup();
    const first = reads.get("/me", parse);
    calls[0]!.answer('{"n":1}');
    await first;
    const single = reads.get("/tasks", parse);
    let release!: (parts: Record<string, string>) => void;
    const full = reads.all(() => new Promise((r) => (release = r)), parserFor);
    reads.forget();
    expect(reads.peek("/me", parse)).toBeNull();
    calls[1]!.answer('{"n":7}');
    await expect(single).rejects.toThrow();
    release({ "/me": '{"n":8}', "/tasks": '{"n":9}' });
    expect(await full).toBe(false);
    expect(reads.peek("/me", parse)).toBeNull();
    expect(reads.peek("/tasks", parse)).toBeNull();
    expect([...stored.keys()].filter((k) => k.startsWith("screen:"))).toEqual([]);
    // The next person's reads work as usual.
    const mine = reads.get("/me", parse);
    calls[2]!.answer('{"n":2}');
    expect(await mine).toEqual({ n: 2 });
  });

  it("a slow full answer never replaces a newer single one", async () => {
    const { reads, calls } = setup();
    let release!: (parts: Record<string, string>) => void;
    const going = reads.all(() => new Promise((r) => (release = r)), parserFor);
    reads.changed();
    const own = reads.get("/tasks", parse);
    calls[0]!.answer('{"n":2}');
    await own;
    release({ "/tasks": '{"n":1}' });
    await going;
    expect(reads.peek("/tasks", parse)).toEqual({ n: 2 });
  });
});
