import { describe, expect, it } from "vitest";
import type { Item } from "@fakkarni/shared";
import { withNativeAlarms, type NativeAlarms } from "./alarm";
import type { PlannedNotification } from "./plan";
import type { NotificationHost } from "./scheduler";

const item = { id: "a", title: "Wake up" } as Item;
const at = new Date("2026-11-27T04:00:00Z");
const words = () => ({ stop: "Stop", snooze: "Snooze", open: "Open", channel: "Alarms" });

function stand() {
  const calls: string[] = [];
  const expo = new Map<string, number>();
  const nat = new Map<string, number>();
  const base: NotificationHost = {
    list: async () => [...expo].map(([identifier, at]) => ({ identifier, at })),
    schedule: async (n) => {
      calls.push(`expo+${n.identifier}`);
      expo.set(n.identifier, n.date.getTime());
    },
    cancel: async (id) => {
      calls.push(`expo-${id}`);
      expo.delete(id);
    },
    load: () => null,
    save: () => {},
    legacy: () => [],
  };
  const native: NativeAlarms = {
    schedule: (a) => (calls.push(`native+${a.id}`), nat.set(a.id, a.at), true),
    cancel: (id) => (calls.push(`native-${id}`), nat.delete(id)),
    cancelAll: () => (nat.clear(), true),
    list: () => [...nat].map(([identifier, at]) => ({ identifier, at })),
    status: () => ({ exact: true, fullScreen: true }),
    openExactSettings: () => true,
    openFullScreenSettings: () => true,
  };
  return { calls, expo, nat, base, native };
}

const note = (over: Partial<PlannedNotification>): PlannedNotification => ({ identifier: "item_a_hint", date: at, body: "Wake up", kind: "hint", itemId: "a", ...over });

describe("withNativeAlarms", () => {
  it("is the plain host in a build without the module", () => {
    const { base } = stand();
    expect(withNativeAlarms(base, null, words)).toBe(base);
  });

  it("sends an alarm to the native alarm and removes an older build's copy", async () => {
    const s = stand();
    s.expo.set("item_a_hint", at.getTime());
    const host = withNativeAlarms(s.base, s.native, words);
    await host.schedule(note({ alarm: true }), item);
    expect(s.nat.get("item_a_hint")).toBe(at.getTime());
    expect(s.expo.has("item_a_hint")).toBe(false);
    expect(await host.list()).toEqual([{ identifier: "item_a_hint", at: at.getTime() }]);
  });

  it("an alarm turned off goes back to a plain notification", async () => {
    const s = stand();
    const host = withNativeAlarms(s.base, s.native, words);
    await host.schedule(note({ alarm: true }), item);
    await host.schedule(note({}), item);
    expect(s.nat.size).toBe(0);
    expect(s.expo.has("item_a_hint")).toBe(true);
  });

  it("cancel clears both, and the list holds both kinds", async () => {
    const s = stand();
    const host = withNativeAlarms(s.base, s.native, words);
    await host.schedule(note({ alarm: true }), item);
    await host.schedule(note({ identifier: "item_a_followup", kind: "followup" }), item);
    expect((await host.list())?.map((l) => l.identifier).sort()).toEqual(["item_a_followup", "item_a_hint"]);
    await host.cancel("item_a_hint");
    expect(s.nat.size).toBe(0);
  });

  it("can't say what is scheduled when the native list fails", async () => {
    const s = stand();
    s.native.list = () => {
      throw new Error("gone");
    };
    expect(await withNativeAlarms(s.base, s.native, words).list()).toBeNull();
  });
});
