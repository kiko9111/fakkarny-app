import { describe, expect, it } from "vitest";
import { plusActions, quickReplies, withStarter, type PlusCircle } from "./plus";

const circle = (id: string, kind: string, member_count = 3): PlusCircle => ({ id, name: `c-${id}`, kind, member_count });
const keys = (rows: { key: string }[]) => rows.map((r) => r.key);
const row = (rows: ReturnType<typeof plusActions>, key: string) => rows.find((r) => r.key === key);

describe("the chat's +", () => {
  it("offers a reminder, asking someone and a split to someone with nothing yet", () => {
    const rows = plusActions({ photos: false, lists: false, circles: [] });
    expect(keys(rows)).toEqual(["remind", "ask", "split", "forward"]);
    expect(row(rows, "remind")!.step).toEqual({ compose: "remind" });
    // No circle: asking someone starts with making one.
    expect(row(rows, "ask")!.step).toEqual({ go: "/circle/new" });
    expect(row(rows, "split")).toMatchObject({ place: "daftar", step: { go: "/split/new" } });
    expect(row(rows, "forward")).toMatchObject({ place: null, step: { go: "/forward" } });
  });

  it("opens the only list, starts the first one, and asks which when there are several", () => {
    const list = (listIds: string[]) => row(plusActions({ photos: false, lists: true, listIds, circles: [] }), "list")?.step;
    expect(list([])).toEqual({ go: "/list?new=1" });
    expect(list(["a b"])).toEqual({ go: "/list/a%20b" });
    expect(list(["a", "b"])).toEqual({ go: "/list" });
  });

  it("shows the receipt only with the photo picker and lists only once the server has them", () => {
    expect(keys(plusActions({ photos: true, lists: true, circles: [] }))).toEqual(["remind", "list", "ask", "split", "receipt", "forward"]);
    const rows = plusActions({ photos: true, lists: true, circles: [] });
    expect(row(rows, "receipt")).toMatchObject({ place: "daftar", step: { go: "/receipt" } });
    expect(row(rows, "list")).toMatchObject({ place: "today", step: { go: "/list" } });
  });

  it("goes straight to the one circle", () => {
    const rows = plusActions({ photos: false, lists: false, circles: [circle("a b", "family")] });
    expect(row(rows, "ask")).toMatchObject({ place: "people", step: { go: "/task/new?circle=a%20b" } });
    expect(row(rows, "homework")).toMatchObject({ place: "people", step: { go: "/homework/plan?circle=a%20b" } });
  });

  it("asks which circle when several fit", () => {
    const rows = plusActions({ photos: false, lists: false, circles: [circle("1", "family"), circle("2", "friends"), circle("3", "family")] });
    expect(row(rows, "ask")!.step).toEqual({
      pick: [
        { id: "1", name: "c-1", route: "/task/new?circle=1" },
        { id: "2", name: "c-2", route: "/task/new?circle=2" },
        { id: "3", name: "c-3", route: "/task/new?circle=3" },
      ],
    });
    expect(row(rows, "homework")!.step).toEqual({
      pick: [
        { id: "1", name: "c-1", route: "/homework/plan?circle=1" },
        { id: "3", name: "c-3", route: "/homework/plan?circle=3" },
      ],
    });
  });

  it("has no homework row without a family circle", () => {
    expect(keys(plusActions({ photos: false, lists: false, circles: [circle("2", "friends")] }))).not.toContain("homework");
  });

  it("leaves out circles with nobody else in them when another has people", () => {
    const rows = plusActions({ photos: false, lists: false, circles: [circle("alone", "family", 1), circle("full", "family", 4)] });
    expect(row(rows, "ask")!.step).toEqual({ go: "/task/new?circle=full" });
    expect(row(rows, "homework")!.step).toEqual({ go: "/homework/plan?circle=full" });
  });

  it("still opens a circle that only has her in it", () => {
    const rows = plusActions({ photos: false, lists: false, circles: [circle("alone", "family", 1)] });
    expect(row(rows, "ask")!.step).toEqual({ go: "/task/new?circle=alone" });
    expect(row(rows, "homework")!.step).toEqual({ go: "/homework/plan?circle=alone" });
  });
});

describe("the reminder starter", () => {
  it("fills an empty composer and keeps what was typed", () => {
    expect(withStarter("", "Remind me to ")).toBe("Remind me to ");
    expect(withStarter("  \n", "Remind me to ")).toBe("Remind me to ");
    expect(withStarter("buy bread", "Remind me to ")).toBe("buy bread");
  });
});

describe("quick replies", () => {
  it("shows at most two and none that repeats a row of the +", () => {
    expect(quickReplies(["What do I have this week?", "Remind me of something", "How was my day?"], ["Remind me of something"])).toEqual(["What do I have this week?", "How was my day?"]);
    expect(quickReplies(["a", "b", "c"], [])).toEqual(["a", "b"]);
    expect(quickReplies(["a ", "b"], ["a"])).toEqual(["b"]);
  });

  it("offers medicine times in a family circle once the server has care circles", () => {
    expect(row(plusActions({ photos: false, lists: false, circles: [circle("1", "family")] }), "medicine")).toBeUndefined();
    expect(row(plusActions({ photos: false, lists: false, care: true, circles: [circle("1", "friends")] }), "medicine")).toBeUndefined();
    // A parent's circle may hold only the one who adds it: no need for others yet.
    expect(row(plusActions({ photos: false, lists: false, care: true, circles: [circle("1", "family", 1), circle("2", "friends")] }), "medicine")).toMatchObject({ place: "people", step: { go: "/care/new?circle=1" } });
  });
});
