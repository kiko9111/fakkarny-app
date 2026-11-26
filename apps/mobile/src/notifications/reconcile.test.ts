import { describe, expect, it } from "vitest";
import type { PlannedNotification } from "./plan";
import { firesAt, FIRED_GRACE_MS, hashText, itemChanges, signature, UNKNOWN } from "./reconcile";

const now = Date.parse("2026-11-26T12:00:00Z");
const at = (min: number) => new Date(now + min * 60_000);
const hint = (date: Date, body = "Heading out soon?"): PlannedNotification => ({ identifier: "item_a_hint", date, body, kind: "hint", itemId: "a" });
const clear = (date: Date): PlannedNotification => ({ identifier: "item_a_clear", date, body: "Dentist at 6", kind: "clear", itemId: "a" });
const rec = (...ns: PlannedNotification[]) => new Map(ns.map((n) => [n.identifier, signature(n)]));

describe("signature", () => {
  it("changes with the time, the words, the kind and the alarm", () => {
    const base = signature(hint(at(60)));
    expect(signature(hint(at(60)))).toBe(base);
    expect(signature(hint(at(61)))).not.toBe(base);
    expect(signature(hint(at(60), "other words"))).not.toBe(base);
    expect(signature({ ...hint(at(60)), kind: "clear" })).not.toBe(base);
    expect(signature({ ...hint(at(60)), alarm: true })).not.toBe(base);
  });

  it("keeps no words, only a short hash", () => {
    expect(signature(hint(at(60), "call mom about the dentist"))).not.toContain("mom");
    expect(hashText("abc")).toBe(hashText("abc"));
    expect(hashText("abc")).not.toBe(hashText("abd"));
  });

  it("knows when a recorded notification fires", () => {
    expect(firesAt(signature(hint(at(60))))).toBe(at(60).getTime());
    expect(firesAt(UNKNOWN)).toBeNull();
  });
});

describe("itemChanges", () => {
  it("does nothing when the plan is already scheduled", () => {
    const plan = [hint(at(60)), clear(at(90))];
    expect(itemChanges("a", plan, rec(...plan), now, true)).toEqual({ schedule: [], cancel: [], forget: [] });
  });

  it("schedules a changed time again (it replaces) and cancels what the plan dropped", () => {
    const known = rec(hint(at(60)), clear(at(90)));
    const c = itemChanges("a", [hint(at(120))], known, now, true);
    expect(c.schedule.map((n) => n.identifier)).toEqual(["item_a_hint"]);
    expect(c.cancel).toEqual(["item_a_clear"]);
    expect(c.forget).toEqual([]);
  });

  it("clears everything of a closed item, its snooze too", () => {
    const known = rec(hint(at(60)), clear(at(90)));
    known.set("item_a_snooze", signature({ date: at(30), kind: "hint", body: "x" }));
    const c = itemChanges("a", [], known, now, false);
    expect(c.cancel.sort()).toEqual(["item_a_clear", "item_a_hint", "item_a_snooze"]);
  });

  it("leaves an open item's snooze alone", () => {
    const known = rec(hint(at(60)));
    known.set("item_a_snooze", signature({ date: at(30), kind: "hint", body: "x" }));
    expect(itemChanges("a", [hint(at(60))], known, now, true)).toEqual({ schedule: [], cancel: [], forget: [] });
  });

  it("forgets passed ones without a call (they fired), and lets one that is due now ring", () => {
    const known = rec(hint(at(-30)));
    known.set("item_a_clear", signature(clear(new Date(now - FIRED_GRACE_MS / 2))));
    expect(itemChanges("a", [], known, now, true)).toEqual({ schedule: [], cancel: [], forget: ["item_a_hint"] });
  });

  it("cancels a closed item's notification that is due this moment", () => {
    const known = rec(clear(new Date(now - FIRED_GRACE_MS / 2)));
    expect(itemChanges("a", [], known, now, false).cancel).toEqual(["item_a_clear"]);
  });

  it("cancels an unknown identifier of the item (left by an older version), never another item's", () => {
    const known = new Map([
      ["item_a_r3", UNKNOWN],
      ["item_ab_hint", UNKNOWN],
      ["item_b_hint", UNKNOWN],
    ]);
    const c = itemChanges("a", [hint(at(60))], known, now, true);
    expect(c.cancel).toEqual(["item_a_r3"]);
    expect(c.schedule.map((n) => n.identifier)).toEqual(["item_a_hint"]);
  });
});
