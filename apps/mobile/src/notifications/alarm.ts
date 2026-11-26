import type { Item } from "@fakkarni/shared";
import type { PlannedNotification } from "./plan";
import type { Listed, NotificationHost } from "./scheduler";

/** The ZakiAlarm native module (modules/zaki-alarm, Android builds from 2026-11-26 on). */
export interface NativeAlarms {
  schedule(alarm: {
    id: string;
    at: number;
    title: string;
    body: string;
    stop: string;
    snooze: string;
    open: string;
    channel: string;
    snoozeMinutes: number;
  }): boolean;
  cancel(id: string): boolean;
  cancelAll(): boolean;
  list(): { identifier: string; at: number }[];
  status(): AlarmStatus;
  openExactSettings(): boolean;
  openFullScreenSettings(): boolean;
}

export interface AlarmStatus {
  /** Rings on the minute; otherwise Android may ring it late. */
  exact: boolean;
  /** Fills the screen over the lock screen; otherwise it rings as a loud banner. */
  fullScreen: boolean;
}

export interface AlarmWords {
  stop: string;
  snooze: string;
  open: string;
  channel: string;
}

export const SNOOZE_MINUTES = 10;

/**
 * The notification host with alarms going to the native full-screen alarm when the build has it:
 * an alarm notification is scheduled there (and any expo-notifications copy left from an older
 * build is cancelled, so it can't ring twice); anything else goes to expo-notifications (and a
 * native copy of the same identifier, from when the plan was an alarm, is cancelled). The phone's
 * list is both lists. Without the module the host is returned unchanged.
 */
export function withNativeAlarms(base: NotificationHost, native: NativeAlarms | null, words: () => AlarmWords): NotificationHost {
  if (!native) return base;
  return {
    ...base,
    list: async () => {
      const listed = await base.list();
      if (!listed) return null;
      let alarms: Listed[] = [];
      try {
        alarms = native.list().map((a) => ({ identifier: a.identifier, at: a.at }));
      } catch {
        return null;
      }
      const seen = new Set(alarms.map((a) => a.identifier));
      return [...alarms, ...listed.filter((l) => !seen.has(l.identifier))];
    },
    schedule: async (n: PlannedNotification, item: Item) => {
      if (n.alarm) {
        const w = words();
        native.schedule({ id: n.identifier, at: n.date.getTime(), title: "Zaki", body: n.body, snoozeMinutes: SNOOZE_MINUTES, ...w });
        await base.cancel(n.identifier);
      } else {
        native.cancel(n.identifier);
        await base.schedule(n, item);
      }
    },
    cancel: async (identifier: string) => {
      native.cancel(identifier);
      await base.cancel(identifier);
    },
  };
}
