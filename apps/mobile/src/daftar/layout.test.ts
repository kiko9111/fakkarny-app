import { describe, expect, it } from "vitest";
import { PICK_LIMIT, pocketRows, spendTarget } from "./layout";

const section = (id: string, circle_id: string | null = null) => ({ id, circle_id });

describe("spendTarget", () => {
  it("makes the first section when there is none, also before anything loaded", () => {
    expect(spendTarget([])).toEqual({ go: "new" });
    expect(spendTarget(null)).toEqual({ go: "new" });
  });

  it("opens the only section", () => {
    expect(spendTarget([section("a")])).toEqual({ go: "open", id: "a" });
  });

  it("offers a few to pick from, her own before shared books", () => {
    const t = spendTarget([section("book", "c1"), section("car"), section("home")]);
    expect(t.go).toBe("pick");
    expect(t.go === "pick" && t.sections.map((s) => s.id)).toEqual(["car", "home", "book"]);
  });

  it("sends many to the list", () => {
    const many = Array.from({ length: PICK_LIMIT + 1 }, (_, i) => section(`s${i}`));
    expect(spendTarget(many)).toEqual({ go: "list" });
    expect(spendTarget(many.slice(0, PICK_LIMIT)).go).toBe("pick");
  });
});

const account = (over: Partial<Parameters<typeof pocketRows>[0][number]>) => ({ circle_id: "c1", child_id: "kid", child_name: "Yara", parent_id: "mom", parent_name: "Mona", role: "parent" as const, balance: 0, ...over });

describe("pocketRows", () => {
  it("is empty with no records", () => {
    expect(pocketRows([])).toEqual([]);
  });

  it("adds one child's records across circles into one row", () => {
    expect(pocketRows([account({ balance: 30 }), account({ circle_id: "c2", balance: 20 })])).toEqual([{ key: "parent:kid", name: "Yara", role: "parent", owed: 50 }]);
  });

  it("puts who is still owed first, then by name", () => {
    const rows = pocketRows([account({ child_id: "a", child_name: "Adam", balance: 0 }), account({ child_id: "z", child_name: "Zein", balance: 10 }), account({ child_id: "b", child_name: "Basma", balance: 5 })]);
    expect(rows.map((r) => r.name)).toEqual(["Basma", "Zein", "Adam"]);
  });

  it("shows a child the parent, and what is owed to them", () => {
    expect(pocketRows([account({ role: "child", balance: 40 })])).toEqual([{ key: "child:mom", name: "Mona", role: "child", owed: 40 }]);
  });

  it("never shows a negative amount and keeps a missing name null", () => {
    expect(pocketRows([account({ balance: -5, child_name: null })])).toEqual([{ key: "parent:kid", name: null, role: "parent", owed: 0 }]);
  });
});
