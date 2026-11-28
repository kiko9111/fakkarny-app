import { describe, expect, it } from "vitest";
import { partFrom, PICK_LIMIT, pocketRows, spendTarget } from "./layout";

const section = (id: string, circle_id: string | null = null) => ({ id, circle_id });

describe("partFrom", () => {
  it("reads the part a link asks for and nothing else", () => {
    expect(partFrom("people")).toBe("people");
    expect(partFrom(["split", "people"])).toBe("split");
    expect(partFrom("spend")).toBe("spend");
    expect(partFrom("settings")).toBeNull();
    expect(partFrom(undefined)).toBeNull();
  });
});

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

describe("the strips", () => {
  const bill = (over: object) => ({ mine: true, me: null, paid_by: 0, people: [{ share: 100, paid: false }, { share: 60, paid: false }, { share: 40, paid: true }], ...over }) as never;

  it("counts private notes, this month's gam'eya round and shares of other people's bills", async () => {
    const { peopleTotals } = await import("./layout");
    const book = { round: 1, months: 3, amount: 1000, members: [{ id: "me", is_me: true }], payments: [] } as never;
    const paidBook = { round: 1, months: 3, amount: 500, members: [{ id: "me", is_me: true }], payments: [{ member_id: "me", round: 1 }] } as never;
    expect(peopleTotals({ shared: { owedToMe: 750, iOwe: 120 }, notesOwedToMe: 200, notesIOwe: 0, gameyas: [book, paidBook], splits: [bill({ mine: false, me: 1 })] })).toEqual({ owedToMe: 950, iOwe: 120, due: 1060 });
  });

  it("sums the splits and says the reader's side of each", async () => {
    const { splitSide, splitTotals } = await import("./layout");
    const mine = bill({});
    const theirs = bill({ mine: false, me: 1 });
    const done = bill({ people: [{ share: 100, paid: false }, { share: 60, paid: true }] });
    expect(splitTotals([mine, theirs, done, bill({ paid_by: null })])).toEqual({ open: 2, iOwe: 60, owedToMe: 60 });
    expect(splitSide(mine)).toEqual({ says: "owed", amount: 60 });
    expect(splitSide(theirs)).toEqual({ says: "you_owe", amount: 60 });
    expect(splitSide(done)).toEqual({ says: "settled", amount: 0 });
  });

  it("puts the open part's action first", async () => {
    const { partFirst } = await import("./layout");
    const rows = [{ key: "money" }, { key: "debt" }, { key: "split" }];
    expect(partFirst(rows, "split").map((r) => r.key)).toEqual(["split", "money", "debt"]);
    expect(partFirst(rows, "spend").map((r) => r.key)).toEqual(["money", "debt", "split"]);
  });
});
