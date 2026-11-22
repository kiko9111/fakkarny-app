import { describe, expect, it } from "vitest";
import type { Item } from "@fakkarni/shared";
import { changedItems } from "./changed";

const item = (id: string, updated_at: string) => ({ id, updated_at }) as Item;

describe("changedItems", () => {
  it("keeps new items and items changed on the server, skips the rest", () => {
    const local = new Map([
      ["a", "2026-11-22T10:00:00.000Z"],
      ["b", "2026-11-22T10:00:00.000Z"],
    ]);
    const out = changedItems([item("a", "2026-11-22T10:00:00.000Z"), item("b", "2026-11-22T11:00:00.000Z"), item("c", "2026-11-22T09:00:00.000Z")], local);
    expect(out.map((i) => i.id)).toEqual(["b", "c"]);
  });
});
