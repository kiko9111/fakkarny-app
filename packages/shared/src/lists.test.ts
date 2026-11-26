import { describe, expect, it } from "vitest";
import { foldThing, listsForPlace, sortListItems, splitThings } from "./lists";

describe("household lists", () => {
  it("splits things and folds names", () => {
    expect(splitThings("بيض ولبن وعيش").map((t) => t.title)).toEqual([
      "بيض",
      "لبن",
      "عيش",
    ]);
    expect(splitThings("ورق عنب ووز").map((t) => t.title)).toEqual([
      "ورق عنب",
      "وز",
    ]);
    expect(splitThings("eggs, milk & 2 bread\nrice")).toEqual([
      { title: "eggs", qty: null },
      { title: "milk", qty: null },
      { title: "bread", qty: "2" },
      { title: "rice", qty: null },
    ]);
    expect(splitThings("بيض، البيض").map((t) => t.title)).toEqual(["بيض"]);
    expect(splitThings("٣ لبن")).toEqual([{ title: "لبن", qty: "3" }]);
    expect(foldThing("البيضة")).toBe(foldThing("بيضه"));
    expect(foldThing("The Eggs!")).toBe("eggs");
  });

  it("picks lists for a place and sorts items", () => {
    const lists = [
      { id: "a", place: "grocery" as const, open_count: 2 },
      { id: "b", place: "grocery" as const, open_count: 0 },
      { id: "c", place: "grocery" as const, open_count: 5 },
      { id: "d", place: "pharmacy" as const, open_count: 1 },
    ];
    expect(listsForPlace(lists, "grocery").map((l) => l.id)).toEqual([
      "c",
      "a",
    ]);
    const items = [
      {
        id: "1",
        done: true,
        done_at: "2026-11-22T10:00:00Z",
        created_at: "2026-11-22T08:00:00Z",
      },
      {
        id: "2",
        done: false,
        done_at: null,
        created_at: "2026-11-22T09:00:00Z",
      },
      {
        id: "3",
        done: false,
        done_at: null,
        created_at: "2026-11-22T07:00:00Z",
      },
      {
        id: "4",
        done: true,
        done_at: "2026-11-22T11:00:00Z",
        created_at: "2026-11-22T06:00:00Z",
      },
    ];
    expect(sortListItems(items).map((i) => i.id)).toEqual(["3", "2", "4", "1"]);
  });
});
