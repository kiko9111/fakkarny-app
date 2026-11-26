import { describe, expect, it } from "vitest";
import { ARRIVING, createEntrance } from "./entrance";

// Lists are newest first, as the chat draws them.
describe("which chat bubbles rise into place", () => {
  it("leaves alone everything that is there when the chat opens", () => {
    const e = createEntrance();
    // Before the first list is known, nothing arrives (the list is still being read).
    expect(e.fresh("a")).toBe(false);
    e.list(["b", "a"]);
    expect(e.fresh("a")).toBe(false);
    expect(e.fresh("b")).toBe(false);
  });

  it("lets a message that comes later arrive, once", () => {
    const e = createEntrance();
    e.list(["a"]);
    e.list(["c", "a"]);
    expect(e.fresh("a")).toBe(false);
    expect(e.fresh("c")).toBe(true);
    // Asked twice before it is drawn (React may render twice): still arriving.
    expect(e.fresh("c")).toBe(true);
    e.shown("c");
    // Scrolled out of the list's window and back: it is not new any more.
    expect(e.fresh("c")).toBe(false);
    // The same list again (another render) changes nothing.
    e.list(["c", "a"]);
    expect(e.fresh("c")).toBe(false);
  });

  it("keeps the stored reply from arriving again where its draft stood", () => {
    const e = createEntrance();
    e.list(["m1"]);
    e.list(["m1:reply:0", "m1"]);
    expect(e.fresh("m1:reply:0")).toBe(true);
    e.shown("m1:reply:0");
    // The draft is taken back and written again, then the stored reply takes its place.
    e.list(["m1"]);
    e.list(["m1:reply:0", "m1"]);
    expect(e.fresh("m1:reply:0")).toBe(false);
  });

  it("lets a whole reply arrive together", () => {
    const e = createEntrance();
    e.list(["m1"]);
    e.list(["m1:reply:2", "m1:reply:1", "m1:reply:0", "m1"]);
    expect(["m1:reply:0", "m1:reply:1", "m1:reply:2"].map(e.fresh)).toEqual([true, true, true]);
    expect(e.fresh("m1")).toBe(false);
  });

  it("draws a history that lands in one piece in place, but for its newest few", () => {
    const e = createEntrance();
    // A new phone: the chat opens with the greeting, then signing in pulls 200 messages.
    e.list(["greeting"]);
    const pulled = Array.from({ length: 200 }, (_, i) => `old-${i}`);
    e.list(pulled);
    expect(pulled.filter(e.fresh)).toEqual(pulled.slice(0, ARRIVING));
    // Scrolled to much later, a row far up the list is drawn for the first time: it is simply there.
    expect(e.fresh("old-150")).toBe(false);
  });

  it("starts with the first list, also when that one is empty", () => {
    const e = createEntrance();
    e.list([]);
    e.list(["a"]);
    expect(e.fresh("a")).toBe(true);
  });
});
