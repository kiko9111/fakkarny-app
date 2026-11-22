import type { Item } from "@fakkarni/shared";

/** The browser preview has no local notifications: reminders still show in the chat and in Today. */
export async function setupNotifications() {}
export async function ensurePermissionAndRegister(): Promise<boolean> {
  return false;
}
export async function scheduleItem(_item: Item) {}
export async function scheduleItems(_items: Item[]) {}
export function listenForNotifications(_onMessage: () => void, _say: (text: string) => void) {
  return () => {};
}
