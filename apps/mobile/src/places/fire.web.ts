import type * as Notifications from "expo-notifications";
import { createEmitter } from "@/lib/emitter";
import type { PlaceEvent } from "./native";

/** The browser preview has no location or notifications: place reminders do nothing there. */
export const ARRIVAL_CATEGORY = "arrival";
export const arrivalSent = createEmitter<{ circle: string; place: string }>();
export async function handlePlaceEvents(_events: PlaceEvent[]): Promise<void> {}
export async function answerPlaceTap(_res: Notifications.NotificationResponse): Promise<boolean> {
  return false;
}
export async function setupPlaceNotifications(): Promise<void> {}
export async function refreshPlaces(_chatChanged?: () => void): Promise<void> {}
