import { describe, expect, it } from "vitest";
import type { Item } from "@fakkarni/shared";
import { parseTaps, widgetData, widgetRoute, type WidgetWords } from "./data";

const words: WidgetWords = { title: "Zaki", needs: "Needs you · {n}", tomorrow: "Tomorrow", anytime: "Anytime", next: "Next", done: "Done", empty: "Nothing", talk: "Talk", remind: "Remind me" };
const item = (id: string, at: string | null, extra: Partial<Item> = {}) =>
  ({ id, title: id, type: "reminder", status: "open", remind_at: at, due_at: at, repeat_every_minutes: null, ...extra }) as Item;
const build = (items: Item[], now: string, needs: { title: string; line: string }[] = []) =>
  widgetData({ items, needs, now: new Date(now), words, rtl: false, locale: "en", accent: "#A9461E", theme: "sunrise", awake: () => true });

describe("widgetData", () => {
  it("lists plans soonest first, untimed after, and drops old ones", () => {
    const out = build([item("none", null), item("late", "2026-11-27T18:00:00Z"), item("soon", "2026-11-27T12:00:00Z"), item("old", "2026-11-26T08:00:00Z")], "2026-11-27T10:00:00Z");
    expect(out.plans.map((p) => p.id)).toEqual(["soon", "late", "none"]);
    expect(out.plans[0]).toMatchObject({ at: Date.parse("2026-11-27T12:00:00Z"), until: Date.parse("2026-11-27T13:00:00Z") });
    expect(out.plans[2]).toMatchObject({ at: null, until: null });
  });

  it("keeps a plan whose reminder passed while its own time is ahead, at that time", () => {
    const p = item("dentist", null, { remind_at: "2026-11-27T08:00:00Z", due_at: "2026-11-28T09:00:00Z" });
    const out = build([p], "2026-11-27T10:00:00Z");
    expect(out.plans[0]).toMatchObject({ id: "dentist", at: Date.parse("2026-11-28T09:00:00Z") });
  });

  it("leaves out closed items, notes and list items", () => {
    const out = build([item("done", "2026-11-27T12:00:00Z", { status: "done" }), item("note", null, { type: "note" } as Partial<Item>), item("milk", null, { type: "list_item" } as Partial<Item>)], "2026-11-27T10:00:00Z");
    expect(out.plans).toEqual([]);
  });

  it("gives repeating reminders their next times, the soonest dose first", () => {
    const pills = item("pills", "2026-11-27T08:00:00Z", { repeat_every_minutes: 8 * 60 });
    const water = item("water", "2026-11-27T09:30:00Z", { repeat_every_minutes: 60 });
    const out = build([pills, water], "2026-11-27T10:00:00Z");
    expect(out.plans).toEqual([]);
    expect(out.doses.map((d) => d.id)).toEqual(["water", "pills"]);
    expect(out.doses[1]!.times.slice(0, 2)).toEqual([Date.parse("2026-11-27T16:00:00Z"), Date.parse("2026-11-28T00:00:00Z")]);
    expect(out.doses[0]!.times[0]).toBe(Date.parse("2026-11-27T10:30:00Z"));
  });

  it("counts what needs an answer and shows the first", () => {
    const out = build([], "2026-11-27T10:00:00Z", [{ title: "Buy bread", line: "From Mama" }, { title: "Hana", line: "You owe 50" }]);
    expect(out.needs).toEqual({ count: 2, first: "Buy bread · From Mama" });
  });
});

describe("parseTaps", () => {
  it("reads taps once each and drops junk", () => {
    const json = JSON.stringify([{ kind: "plan", id: "a", at: 0, title: "A" }, { kind: "plan", id: "a" }, { kind: "dose", id: "p", at: 5, title: "Pills" }, { kind: "dose", id: "p", at: 9 }, { id: 3 }, null]);
    expect(parseTaps(json).map((t) => `${t.kind}:${t.id}@${t.at}`)).toEqual(["plan:a@0", "dose:p@5", "dose:p@9"]);
    expect(parseTaps("nope")).toEqual([]);
    expect(parseTaps(null)).toEqual([]);
  });
});

describe("widgetRoute", () => {
  it("maps widget links and leaves others alone", () => {
    expect(widgetRoute("fakkarni://widget/chat")).toBe("/");
    expect(widgetRoute("fakkarni://widget/remind")).toBe("/?compose=remind");
    expect(widgetRoute("/widget/today")).toBe("/today");
    expect(widgetRoute("widget/plans")).toBe("/upcoming");
    expect(widgetRoute("fakkarni://invite/ABC")).toBeNull();
    expect(widgetRoute("/")).toBeNull();
  });
});
