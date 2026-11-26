import { describe, expect, it } from "vitest";
import type { PlannedNotification } from "./plan";
import { firesAt, FIRED_GRACE_MS, hashText, itemChanges, listedSignature, signature, SNOOZE_SAME_MS, UNKNOWN } from "./reconcile";

const now = Date.parse("2026-11-26T12:00:00Z");
const at = (min: number) => new Date(now + min * 60_000);
const hint = (date: Date, body = "Heading out soon?"): PlannedNotification => ({ identifier: "item_a_hint", date, body, kind: "hint", itemId: "a" });
const clear = (date: Date): PlannedNotification => ({ identifier: "item_a_clear", date, body: "Dentist at 6", kind: "clear", itemId: "a" });
const rec = (...ns: PlannedNotification[]) => new Map(ns.map((n) => [n.identifier, signature(n)]));

describe("signature", () => {
  it("changes with the time, the words, the kind, the alarm and the plan's title", () => {
    const base = signature(hint(at(60)));
    expect(signature(hint(at(60)))).toBe(base);
    expect(signature(hint(at(61)))).not.toBe(base);
    expect(signature(hint(at(60), "other words"))).not.toBe(base);
    expect(signature({ ...hint(at(60)), kind: "clear" })).not.toBe(base);
    expect(signature({ ...hint(at(60)), alarm: true })).not.toBe(base);
    // Done / Later send the title: a renamed plan with the same words is scheduled again.
    expect(signature({ ...hint(at(60)), title: "Call mom" })).not.toBe(signature({ ...hint(at(60)), title: "Call mom about Friday" }));
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

  it("lets a Later snooze give way when the plan's own reminder rings close to it (the server moved the plan)", () => {
    const snoozed = new Map([["item_a_snooze", signature({ date: at(60), kind: "hint", body: "x" })]]);
    expect(itemChanges("a", [hint(at(61))], snoozed, now, true)).toEqual({ schedule: [hint(at(61))], cancel: ["item_a_snooze"], forget: [] });
    expect(itemChanges("a", [hint(new Date(at(60).getTime() + SNOOZE_SAME_MS + 60_000))], snoozed, now, true).cancel).toEqual([]);
    // One whose time has come is left to ring.
    const due = new Map([["item_a_snooze", signature({ date: at(-1), kind: "hint", body: "x" })]]);
    expect(itemChanges("a", [hint(at(1))], due, now, true).cancel).toEqual([]);
  });

  it("lets an open item's passed ones ring however late (Android rings late), and forgets them once surely rung", () => {
    const known = rec(hint(at(-90)));
    known.set("item_a_clear", signature(clear(new Date(now - FIRED_GRACE_MS - 60_000))));
    expect(itemChanges("a", [], known, now, true)).toEqual({ schedule: [], cancel: [], forget: ["item_a_clear"] });
  });

  it("cancels a closed item's notification that is due this moment", () => {
    const known = rec(clear(new Date(now - FIRED_GRACE_MS / 2)));
    expect(itemChanges("a", [], known, now, false).cancel).toEqual(["item_a_clear"]);
  });

  it("cancels a closed item's notification an hour past its time (not rung yet), and forgets one surely rung", () => {
    const known = rec(hint(at(-70)));
    known.set("item_a_clear", signature(clear(new Date(now - FIRED_GRACE_MS - 60_000))));
    expect(itemChanges("a", [], known, now, false)).toEqual({ schedule: [], cancel: ["item_a_hint"], forget: ["item_a_clear"] });
  });

  it("reads the time of one the phone listed with no record, and schedules a planned one again", () => {
    const listed = listedSignature(at(60).getTime());
    expect(firesAt(listed)).toBe(at(60).getTime());
    expect(itemChanges("a", [hint(at(60))], new Map([["item_a_hint", listed]]), now, true).schedule.map((n) => n.identifier)).toEqual(["item_a_hint"]);
    // Past its time and not rung yet: an open plan's is left to ring, a closed plan's is cancelled.
    const late = new Map([["item_a_hint", listedSignature(at(-20).getTime())]]);
    expect(itemChanges("a", [], late, now, true)).toEqual({ schedule: [], cancel: [], forget: [] });
    expect(itemChanges("a", [], late, now, false).cancel).toEqual(["item_a_hint"]);
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
