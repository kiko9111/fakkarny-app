import { describe, expect, it } from "vitest";
import type { Item } from "@fakkarni/shared";
import { alertsFor, changesSince, emptyVisits, itemsAt, nameTaken, parsePlaces, placesHere, pruneVisits, REFIRE_MS, regionsFor, visit, waitingPlaces, worthWatching, type SavedPlace } from "./logic";

const place = (o: Partial<SavedPlace> & Pick<SavedPlace, "id" | "name">): SavedPlace => ({
  kind: "other",
  latitude: 30.0444,
  longitude: 31.2357,
  radius: 150,
  arrival: null,
  created_at: "2026-11-26T10:00:00Z",
  ...o,
});
const item = (o: Partial<Item>): Item => ({
  id: "i1",
  user_id: "",
  type: "task",
  title: "Buy bread",
  due_at: null,
  remind_at: null,
  important: false,
  alarm: false,
  nudge: null,
  status: "open",
  debt_person: null,
  debt_amount: null,
  debt_direction: null,
  follow_up_at: null,
  repeat_every_minutes: null,
  place: "the supermarket",
  place_on: "arrive",
  source_message_id: null,
  updated_at: "2026-11-26T10:00:00Z",
  created_at: "2026-11-26T10:00:00Z",
  done_at: null,
  ...o,
});
const words = { arrivedAt: "At {place}", leftPlace: "Leaving {place}", listCount: "{count} things on «{list}»", arrivalTitle: "You're at {place}", arrivalBody: "Tell {circle} you arrived?" };

const carrefour = place({ id: "c", name: "Carrefour", kind: "grocery", latitude: 30.05, longitude: 31.24 });
const work = place({ id: "w", name: "الشغل", kind: "work", latitude: 30.1, longitude: 31.3 });
const school = place({ id: "s", name: "School", kind: "school", latitude: 30.0, longitude: 31.2, arrival: { circle_id: "fam", circle_name: "Family" } });
const places = [carrefour, work, school];

describe("saved places", () => {
  it("reads only well-formed places", () => {
    const raw = JSON.stringify([carrefour, { id: "x" }, { ...work, kind: "spaceship", radius: 5 }, "nope"]);
    const got = parsePlaces(raw);
    expect(got.map((p) => p.id)).toEqual(["c", "w"]);
    expect(got[1]).toMatchObject({ kind: "other", radius: 150 });
    expect(parsePlaces("not json")).toEqual([]);
  });
  it("refuses a twin name", () => {
    expect(nameTaken("carrefour", places)).toBe(true);
    expect(nameTaken("شغل", places)).toBe(true);
    expect(nameTaken("Carrefour", places, "c")).toBe(false);
    expect(nameTaken("Gym", places)).toBe(false);
  });
});

describe("which reminders belong where", () => {
  it("matches by kind and by name, arriving and leaving", () => {
    const items = [item({ id: "a" }), item({ id: "b", place: "el shoghl", place_on: "leave", title: "Call mom" }), item({ id: "c", place: "the pharmacy" }), item({ id: "d", status: "done" })];
    expect(itemsAt(carrefour, items, places, "arrive").map((i) => i.id)).toEqual(["a"]);
    expect(itemsAt(work, items, places, "leave").map((i) => i.id)).toEqual(["b"]);
    expect(itemsAt(work, items, places, "arrive")).toEqual([]);
    expect(waitingPlaces(items, places)).toEqual(["the pharmacy"]);
  });
});

describe("being there", () => {
  it("counts a point inside the radius, not a rough fix", () => {
    expect(placesHere({ latitude: 30.0501, longitude: 31.2401, accuracy: 20 }, places).map((p) => p.id)).toEqual(["c"]);
    expect(placesHere({ latitude: 30.0501, longitude: 31.2401, accuracy: 1200 }, places)).toEqual([]);
    expect(placesHere({ latitude: 30.07, longitude: 31.24, accuracy: 20 }, places)).toEqual([]);
  });
  it("fires once per visit and not again too soon", () => {
    const t = 1_000_000;
    let s = emptyVisits();
    let r = visit(s, "c", "enter", t);
    expect(r.fire).toBe(true);
    s = r.next;
    expect(visit(s, "c", "enter", t + 1000).fire).toBe(false); // seen again while inside
    r = visit(s, "c", "exit", t + 60_000);
    expect(r.fire).toBe(true);
    s = r.next;
    expect(visit(s, "c", "enter", t + 120_000).fire).toBe(false); // back within 2 h: a flicker at the edge
    expect(visit(s, "c", "enter", t + REFIRE_MS + 1).fire).toBe(true);
    expect(visit(emptyVisits(), "c", "exit", t).fire).toBe(false); // never seen inside
  });
  it("turns a look with the app open into enter / exit", () => {
    const s = { inside: { w: 1 }, fired: {} };
    expect(changesSince(s, [carrefour], places)).toEqual([
      { placeId: "c", event: "enter" },
      { placeId: "w", event: "exit" },
    ]);
    expect(pruneVisits({ inside: { gone: 1, c: 2 }, fired: { gone: 1 } }, places)).toEqual({ inside: { c: 2 }, fired: {} });
  });
});

describe("what shows", () => {
  it("a reminder, the shop's lists and the arrival offer", () => {
    const alerts = alertsFor(carrefour, "enter", [item({ id: "a" })], places, [{ id: "L", name: "Groceries", open_count: 5 }, { id: "E", name: "Empty", open_count: 0 }], words);
    expect(alerts).toEqual([
      { identifier: "item_a_place", title: "At Carrefour", body: "Buy bread", data: { type: "reminder", itemId: "a", title: "Buy bread", repeating: false }, kind: "reminder" },
      { identifier: "place_c_list_L", title: "At Carrefour", body: "5 things on «Groceries»", data: { type: "place", route: "/list/L" }, kind: "list" },
    ]);
    const arrival = alertsFor(school, "enter", [], places, [], words);
    expect(arrival).toEqual([{ identifier: "place_s_arrival", title: "You're at School", body: "Tell Family you arrived?", data: { type: "arrival", circleId: "fam", place: "School" }, kind: "arrival" }]);
    expect(alertsFor(school, "exit", [], places, [], words)).toEqual([]);
  });
  it("watches only when there is something to do", () => {
    expect(worthWatching([], [])).toBe(false);
    expect(worthWatching([work], [])).toBe(false);
    expect(worthWatching([work], [item({ place: "work" })])).toBe(true);
    expect(worthWatching([carrefour], [])).toBe(true);
    expect(regionsFor(places)[0]).toEqual({ identifier: "c", latitude: 30.05, longitude: 31.24, radius: 150, notifyOnEnter: true, notifyOnExit: true });
  });
});
