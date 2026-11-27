import { describe, expect, it } from "vitest";
import type { HouseList } from "@fakkarni/shared";
import {
  alreadyOn,
  guessAdd,
  guessClear,
  guessDone,
  guessRemove,
  preview,
  quickPicks,
  sortLists,
} from "./logic";

const now = new Date("2026-11-26T20:00:00Z");
const item = (id: string, title: string, done = false) => ({
  id,
  title,
  qty: null,
  added_by_name: "منى",
  is_mine: false,
  done,
  done_by_name: done ? "منى" : null,
  done_at: done ? "2026-11-26T19:00:00.000Z" : null,
  created_at: `2026-11-26T1${id}:00:00.000Z`,
});
const list = (over: Partial<HouseList> = {}): HouseList => ({
  id: "00000000-0000-4000-8000-000000000001",
  name: "البقالة",
  place: "grocery",
  circle_id: null,
  circle_name: null,
  is_owner: true,
  open_count: 2,
  trip: null,
  items: [item("1", "بيض"), item("2", "لبن"), item("3", "عيش", true)],
  has_link: false,
  updated_at: "2026-11-26T18:00:00.000Z",
  ...over,
});

describe("household list guesses", () => {
  it("adds new things only, ticks, removes and clears", () => {
    const added = guessAdd(
      list(),
      [
        { id: "a", title: "البيض", qty: null },
        { id: "b", title: "رز", qty: "2" },
        { id: "c", title: "عيش", qty: null },
      ],
      "كريم",
      now,
    );
    expect(added.items.map((i) => i.title)).toEqual([
      "بيض",
      "لبن",
      "عيش",
      "رز",
      "عيش",
    ]);
    expect(added.open_count).toBe(4);
    expect(alreadyOn(list(), [{ title: "البيض" }, { title: "رز" }])).toEqual([
      "بيض",
    ]);
    const ticked = guessDone(list(), "1", true, "كريم", now);
    expect(ticked.items[0]).toMatchObject({ done: true, done_by_name: "كريم" });
    expect(ticked.open_count).toBe(1);
    expect(guessRemove(list(), "2", now).items.map((i) => i.id)).toEqual([
      "1",
      "3",
    ]);
    expect(guessClear(list(), now).items.map((i) => i.id)).toEqual(["1", "2"]);
  });

  it("orders lists, previews and quick picks", () => {
    const a = list({ id: "a" as never, open_count: 1 });
    const b = list({ id: "b" as never, open_count: 5 });
    const c = list({
      id: "c" as never,
      open_count: 0,
      trip: { user_id: "u", name: "منى", is_me: false, at: now.toISOString() },
    });
    expect(sortLists([a, b, c]).map((l) => l.id)).toEqual(["c", "b", "a"]);
    expect(preview(list(), "، ")).toBe("بيض، لبن");
    expect(quickPicks(list(), ["عيش", "بيض", "رز"])).toEqual(["عيش", "رز"]);
  });
});
