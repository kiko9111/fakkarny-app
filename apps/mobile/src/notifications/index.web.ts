import type { Item } from "@fakkarni/shared";

/** The browser preview has no local notifications: reminders still show in the chat and in Today. */
export async function setupNotifications() {}
export async function ensurePermissionAndRegister(_opts: { force?: boolean } = {}): Promise<boolean> {
  return false;
}
export function watchPushToken() {}
export function scheduleItem(_item: Item): void {}
export async function scheduleItems(_items: readonly Item[], _soon = false): Promise<void> {}
export async function clearScheduled(): Promise<void> {}
export async function tidyShade(): Promise<void> {}
export async function planTheRest(_planned: readonly Item[]): Promise<void> {}
export function listenForNotifications(_onMessage: () => void, _say: (text: string) => void) {
  return () => {};
}
export const fullScreenAlarms = false;
export function alarmStatus(): { exact: boolean; fullScreen: boolean } | null {
  return null;
}
export function openAlarmSetting(_which: "exact" | "fullScreen"): boolean {
  return false;
}
export function testAlarm(_seconds = 10): boolean {
  return false;
}
