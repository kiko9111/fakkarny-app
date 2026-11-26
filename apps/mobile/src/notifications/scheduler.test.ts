import { describe, expect, it } from "vitest";
import type { Item } from "@fakkarni/shared";
import { legacyIds, planReminderNotifications, snoozeId } from "./plan";
import { signature } from "./reconcile";
import { createScheduler, listedAt, type Listed, type NotificationHost } from "./scheduler";

const T0 = Date.parse("2026-11-26T10:00:00Z");
const iso = (minFromT0: number) => new Date(T0 + minFromT0 * 60_000).toISOString();
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

function item(over: Partial<Item> & { id: string }): Item {
  return {
    user_id: "u",
    type: "reminder",
    title: "Call mom",
    due_at: null,
    remind_at: iso(60),
    important: false,
    alarm: false,
    nudge: null,
    status: "open",
    debt_person: null,
    debt_amount: null,
    debt_direction: null,
    follow_up_at: null,
    repeat_every_minutes: null,
    source_message_id: null,
    updated_at: iso(0),
    created_at: iso(0),
    done_at: null,
    ...over,
  };
}

const plan = (i: Item, now: Date) => planReminderNotifications(i, { now, alwaysDirect: false, clearText: (title) => `${title}, just so you know`, awake: () => true });

/**
 * A stand-in for the phone: what is scheduled (and when it fires, as Android lists it), every call
 * made, a stored record, and optional delays. Like a phone whose alarms ring late, it keeps a
 * notification scheduled past its time.
 */
function phone(opts: { scheduled?: string[]; at?: Record<string, number>; list?: "fail" | "hang"; record?: Record<string, string>; callMs?: number; hang?: string } = {}) {
  const scheduled = new Set(opts.scheduled ?? []);
  const times = new Map(Object.entries(opts.at ?? {}));
  const calls: string[] = [];
  let record: Record<string, string> | null = opts.record ?? null;
  const host: NotificationHost = {
    list: async () => {
      calls.push("list");
      if (opts.list === "fail") throw new Error("no list");
      if (opts.list === "hang") return new Promise<Listed[]>(() => {});
      return [...scheduled].map((identifier) => ({ identifier, at: times.get(identifier) ?? null }));
    },
    schedule: async (n) => {
      calls.push(`schedule ${n.identifier}`);
      if (opts.hang === n.identifier) return new Promise<void>(() => {});
      if (opts.callMs) await pause(opts.callMs);
      scheduled.add(n.identifier);
      times.set(n.identifier, n.date.getTime());
    },
    cancel: async (id) => {
      calls.push(`cancel ${id}`);
      if (opts.callMs) await pause(opts.callMs);
      scheduled.delete(id);
    },
    load: () => record,
    save: (r) => {
      record = r;
    },
    legacy: legacyIds,
  };
  return {
    host,
    calls,
    scheduled,
    record: () => record,
    /** Calls made since the last look. */
    take() {
      return calls.splice(0);
    },
  };
}

const make = (p: ReturnType<typeof phone>, extra: { now?: () => number; callTimeoutMs?: number } = {}) =>
  createScheduler({ host: p.host, plan, now: extra.now ?? (() => T0), ...(extra.callTimeoutMs ? { callTimeoutMs: extra.callTimeoutMs } : {}) });

describe("notification scheduler", () => {
  it("does not keep the caller waiting: enqueue returns before any native call is answered", async () => {
    const p = phone({ callMs: 50 });
    const s = make(p);
    const started = Date.now();
    const done = s.enqueue([item({ id: "a" })], true);
    expect(Date.now() - started).toBeLessThan(20);
    await done;
    expect(p.scheduled.has("item_a_hint")).toBe(true);
  });

  it("makes no native call for an item whose plan is already scheduled", async () => {
    const p = phone();
    const s = make(p);
    const a = item({ id: "a", due_at: iso(120) });
    await s.enqueue([a]);
    expect(p.take()).toEqual(["list", "schedule item_a_hint", "schedule item_a_clear"]);
    await s.enqueue([a]);
    await s.enqueue([a, item({ id: "note", type: "note", remind_at: null })]);
    expect(p.take()).toEqual([]);
  });

  it("schedules only what changed: a new time replaces the hint, a dropped clear is cancelled", async () => {
    const p = phone();
    const s = make(p);
    await s.enqueue([item({ id: "a", due_at: iso(120) })]);
    p.take();
    await s.enqueue([item({ id: "a", remind_at: iso(90), due_at: null })]);
    expect(p.take()).toEqual(["cancel item_a_clear", "schedule item_a_hint"]);
  });

  it("clears a closed item's notifications, its Later snooze too", async () => {
    const p = phone();
    const s = make(p);
    await s.enqueue([item({ id: "a", due_at: iso(120) })]);
    s.remember(snoozeId("a"), signature({ date: new Date(T0 + 30 * 60_000), kind: "hint", body: "Call mom" }));
    // Re-planning the open item leaves the snooze alone.
    await s.enqueue([item({ id: "a", due_at: iso(120) })]);
    p.take();
    await s.enqueue([item({ id: "a", due_at: iso(120), status: "done" })]);
    expect(p.take().sort()).toEqual(["cancel item_a_clear", "cancel item_a_hint", "cancel item_a_snooze"]);
  });

  it("adds only the new occurrences of a repeating reminder when its window moves on", async () => {
    let now = T0;
    const p = phone();
    const s = make(p, { now: () => now });
    const water = item({ id: "w", remind_at: iso(30), repeat_every_minutes: 60 });
    await s.enqueue([water]);
    expect(p.take().filter((c) => c.startsWith("schedule"))).toHaveLength(16);
    now = T0 + 140 * 60_000; // two occurrences passed (and fired): 10:30 and 11:30
    await s.enqueue([water]);
    const calls = p.take();
    expect(calls.filter((c) => c.startsWith("cancel"))).toEqual([]);
    expect(calls.filter((c) => c.startsWith("schedule"))).toHaveLength(2);
  });

  it("on the first launch after the update, clears what the old slots left and plans the rest", async () => {
    const p = phone({ scheduled: ["item_w_hint", ...Array.from({ length: 16 }, (_, n) => `item_w_r${n}`), "item_other_hint"] });
    const s = make(p);
    await s.enqueue([item({ id: "w", remind_at: iso(30), repeat_every_minutes: 60 })]);
    const calls = p.take();
    expect(calls.filter((c) => c.startsWith("cancel")).sort()).toEqual(["cancel item_w_hint", ...Array.from({ length: 16 }, (_, n) => `cancel item_w_r${n}`)].sort());
    expect(calls.filter((c) => c.startsWith("schedule"))).toHaveLength(16);
    // Another item's notification is never touched.
    expect(p.scheduled.has("item_other_hint")).toBe(true);
  });

  it("re-schedules everything planned once per launch (the system may have dropped alarms), then nothing", async () => {
    const p = phone();
    const a = item({ id: "a", due_at: iso(120) });
    await make(p).enqueue([a]);
    p.take();
    // The app starts again with the same record and the phone still holding both.
    const s = make(p);
    await s.enqueue([a]);
    expect(p.take()).toEqual(["list", "schedule item_a_hint", "schedule item_a_clear"]);
    await s.enqueue([a]);
    expect(p.take()).toEqual([]);
  });

  it("forgets records the phone no longer holds (fired or cleared)", async () => {
    const p = phone();
    const a = item({ id: "a", due_at: iso(120) });
    await make(p).enqueue([a]);
    p.take();
    p.scheduled.clear();
    const s = make(p);
    await s.enqueue([item({ id: "a", due_at: iso(120), status: "done" })]);
    // Nothing to cancel: the phone holds none of them any more.
    expect(p.take()).toEqual(["list"]);
    expect(Object.keys(p.record() ?? {})).toEqual([]);
  });

  it("puts a reminder just made ahead of a bulk top-up", async () => {
    const p = phone({ callMs: 5 });
    const s = make(p);
    const bulk = Array.from({ length: 6 }, (_, n) => item({ id: `b${n}` }));
    const all = s.enqueue(bulk);
    await pause(8);
    await s.enqueue([item({ id: "new" })], true);
    await all;
    const order = p.calls.filter((c) => c.startsWith("schedule")).map((c) => c.split(" ")[1]);
    expect(order.indexOf("item_new_hint")).toBeGreaterThan(-1);
    expect(order.indexOf("item_new_hint")).toBeLessThan(order.indexOf("item_b5_hint"));
  });

  it("keeps going past a native call that never answers", async () => {
    const p = phone({ hang: "item_a_hint" });
    const s = make(p, { callTimeoutMs: 30 });
    await s.enqueue([item({ id: "a" }), item({ id: "b" })]);
    expect(p.scheduled.has("item_b_hint")).toBe(true);
    // Not known to be scheduled: the next pass tries again, and closing it still clears it.
    p.take();
    await s.enqueue([item({ id: "a", status: "cancelled" })]);
    expect(p.take()).toEqual(["cancel item_a_hint"]);
  });

  it("starts without the phone's list when it can't be read, clearing old identifiers once per item", async () => {
    for (const list of ["fail", "hang"] as const) {
      const p = phone({ list });
      const s = make(p, { callTimeoutMs: 30 });
      await s.enqueue([item({ id: "a", status: "done" })]);
      expect(p.take().filter((c) => c.startsWith("cancel"))).toHaveLength(legacyIds("a").length);
      await s.enqueue([item({ id: "a", status: "done" })]);
      expect(p.take()).toEqual([]);
    }
  });

  it("stops at once when the phone is wiped, and plans nothing more for the last person", async () => {
    const p = phone({ callMs: 10 });
    const s = make(p);
    void s.enqueue(Array.from({ length: 10 }, (_, n) => item({ id: `x${n}` })));
    await pause(25);
    s.reset();
    await s.idle();
    const made = p.calls.length;
    await pause(40);
    expect(p.calls.length).toBe(made);
    expect(made).toBeLessThan(10);
    expect(p.record()).toEqual({});
  });

  it("cancels a closed plan's notification past its time that Android has not rung yet", async () => {
    let now = T0;
    const p = phone();
    const s = make(p, { now: () => now });
    await s.enqueue([item({ id: "a", remind_at: iso(30) })]);
    p.take();
    now = T0 + 75 * 60_000; // 45 minutes past its time, still scheduled
    await s.enqueue([item({ id: "a", remind_at: iso(30) })]);
    expect(p.take()).toEqual([]);
    await s.enqueue([item({ id: "a", remind_at: iso(30), status: "done" })]);
    expect(p.take()).toEqual(["cancel item_a_hint"]);
  });

  it("at start with no record, leaves an open plan's late notification to ring and cancels a closed plan's", async () => {
    const late = T0 - 40 * 60_000;
    const p = phone({ scheduled: ["item_a_hint", "item_b_hint"], at: { item_a_hint: late, item_b_hint: late } });
    const s = make(p);
    await s.enqueue([item({ id: "a", remind_at: iso(-40) }), item({ id: "b", remind_at: iso(-40), status: "done" })]);
    expect(p.take()).toEqual(["list", "cancel item_b_hint"]);
    expect(p.scheduled.has("item_a_hint")).toBe(true);
  });

  it("rings once after Later: the snooze gives way to the plan the server moved an hour on", async () => {
    const p = phone();
    const s = make(p);
    await s.enqueue([item({ id: "a", remind_at: iso(-1) })]);
    s.remember(snoozeId("a"), signature({ date: new Date(T0 + 59 * 60_000), kind: "hint", body: "Call mom" }));
    p.take();
    await s.enqueue([item({ id: "a", remind_at: iso(60) })]);
    expect(p.take()).toEqual(["cancel item_a_snooze", "schedule item_a_hint"]);
    expect([...p.scheduled]).toEqual(["item_a_hint"]);
  });

  it("schedules a renamed plan again, so Done and Later send the new title", async () => {
    const p = phone();
    const s = make(p);
    await s.enqueue([item({ id: "a", nudge: "Heading out soon?" })]);
    p.take();
    await s.enqueue([item({ id: "a", nudge: "Heading out soon?", title: "Call mom about Friday" })]);
    expect(p.take()).toEqual(["schedule item_a_hint"]);
  });

  it("at start, trusts the time the phone lists over a stale record, so a closed plan's is still cancelled", async () => {
    // The record says 06:00 (a run stopped before it wrote the move); the phone holds 12:00.
    const p = phone({ scheduled: ["item_a_hint"], at: { item_a_hint: T0 + 120 * 60_000 }, record: { item_a_hint: signature({ date: new Date(T0 - 240 * 60_000), kind: "hint", body: "Call mom", title: "Call mom" }) } });
    const s = make(p);
    await s.enqueue([item({ id: "a", remind_at: iso(120), status: "done" })]);
    expect(p.take()).toEqual(["list", "cancel item_a_hint"]);
  });

  it("drops what is enqueued during a wipe, and takes items again once reopened", async () => {
    const p = phone({ callMs: 15 });
    const s = make(p);
    void s.enqueue([item({ id: "x" })]);
    await pause(5); // a native call is on its way
    s.reset();
    await s.enqueue([item({ id: "late" })]); // the last person's, answered after the wipe began
    await s.idle();
    expect(p.calls.some((c) => c.includes("item_late"))).toBe(false);
    s.reopen();
    await s.enqueue([item({ id: "next" })]);
    expect(p.scheduled.has("item_next_hint")).toBe(true);
  });

  it("hands on an item enqueued while a stopped run waits on a native call", async () => {
    const p = phone({ callMs: 20 });
    const s = make(p);
    void s.enqueue([item({ id: "x" })]);
    await pause(5);
    s.reset();
    s.reopen();
    const next = s.enqueue([item({ id: "next" })]);
    await next;
    expect(p.scheduled.has("item_next_hint")).toBe(true);
  });

  it("writes the record so the next launch knows what is scheduled", async () => {
    const p = phone();
    await make(p).enqueue([item({ id: "a" })]);
    expect(Object.keys(p.record() ?? {})).toEqual(["item_a_hint"]);
  });
});

describe("listedAt", () => {
  it("reads an Android date trigger's time, and nothing else", () => {
    expect(listedAt({ type: "date", value: T0, repeats: false, channelId: "reminders" })).toBe(T0);
    expect(listedAt({ type: "calendar", value: { year: 2026, month: 11 } })).toBeNull();
    expect(listedAt({ type: "date", value: "soon" })).toBeNull();
    expect(listedAt(null)).toBeNull();
    expect(listedAt(undefined)).toBeNull();
  });
});
