import { describe, expect, it } from "vitest";
import { createEntrance } from "./entrance";

describe("which chat bubbles rise into place", () => {
  it("leaves alone everything that is there when the chat opens", () => {
    const e = createEntrance();
    // Before the first list is known, nothing arrives (the list is still being read).
    expect(e.fresh("a")).toBe(false);
    e.open(["a", "b"]);
    expect(e.fresh("a")).toBe(false);
    expect(e.fresh("b")).toBe(false);
  });

  it("lets a message that comes later arrive, once", () => {
    const e = createEntrance();
    e.open(["a"]);
    expect(e.fresh("c")).toBe(true);
    // Asked twice before it is drawn (React may render twice): still arriving.
    expect(e.fresh("c")).toBe(true);
    e.shown("c");
    // Scrolled out of the list's window and back: it is not new any more.
    expect(e.fresh("c")).toBe(false);
  });

  it("keeps the stored reply from arriving again where its draft stood", () => {
    const e = createEntrance();
    e.open(["m1"]);
    expect(e.fresh("m1:reply:0")).toBe(true);
    e.shown("m1:reply:0");
    expect(e.fresh("m1:reply:0")).toBe(false);
  });

  it("does not forget what was there when the first list is given again", () => {
    const e = createEntrance();
    e.open(["a"]);
    e.shown("b");
    e.open([]);
    expect(e.fresh("a")).toBe(false);
    expect(e.fresh("b")).toBe(false);
    expect(e.fresh("z")).toBe(true);
  });
});
