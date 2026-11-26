import { Linking, Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";
import type { Item } from "@fakkarni/shared";
import { placesHere, regionsFor, worthWatching, changesSince, type SavedPlace } from "./logic";
import { placeStore } from "./store";

/**
 * The phone's location, used only for places the user saved (see logic.ts for the rules).
 * Optional native code: builds made before expo-location and expo-task-manager were added take
 * JavaScript over the air, so nothing here loads those modules unless they exist.
 *
 * Two ways to notice a place:
 * - geofencing (background): the system watches the saved places and wakes the app's task on
 *   arriving or leaving, even when the app is closed. Needs location "all the time".
 * - a look when the app opens (foreground): one position fix, compared with the saved places.
 *   This is all Expo Go and "only while using the app" allow.
 */
export const locationAvailable = Platform.OS !== "web" && requireOptionalNativeModule("ExpoLocation") != null;
export const geofenceAvailable = locationAvailable && requireOptionalNativeModule("ExpoTaskManager") != null;

export const PLACES_TASK = "zaki-places";

type LocationModule = typeof import("expo-location");
type TaskModule = typeof import("expo-task-manager");

// Required here, not at the top: loading the module on a build without it would throw.
const location = (): LocationModule => require("expo-location") as LocationModule;
const tasks = (): TaskModule => require("expo-task-manager") as TaskModule;

export type PlaceEvent = { placeId: string; event: "enter" | "exit" };

/**
 * Registers the geofence task. Must run when the JavaScript bundle loads (also when the system
 * starts the app in the background only to run the task), so the root layout imports it.
 */
export function defineGeofenceTask(handle: (events: PlaceEvent[]) => Promise<void>): void {
  if (!geofenceAvailable) return;
  try {
    const TaskManager = tasks();
    if (TaskManager.isTaskDefined(PLACES_TASK)) return;
    const Location = location();
    TaskManager.defineTask<{ eventType: number; region: { identifier?: string } }>(PLACES_TASK, async ({ data, error }) => {
      if (error || !data?.region?.identifier) return;
      const event = data.eventType === Location.GeofencingEventType.Enter ? "enter" : data.eventType === Location.GeofencingEventType.Exit ? "exit" : null;
      if (!event) return;
      // Started on its own, the app may not have read storage yet.
      placeStore.reload();
      await handle([{ placeId: data.region.identifier, event }]);
    });
  } catch {
    // An old build or Expo Go without the task module: the look on opening still works.
  }
}

export interface LocationAccess {
  /** "Only while using the app" (or more). */
  foreground: boolean;
  /** "All the time": the geofences fire with the app closed. */
  background: boolean;
  /** Asked before and refused for good: only the phone's settings can change it. */
  blocked: boolean;
}

export async function locationAccess(): Promise<LocationAccess> {
  if (!locationAvailable) return { foreground: false, background: false, blocked: false };
  try {
    const Location = location();
    const fg = await Location.getForegroundPermissionsAsync();
    const bg = geofenceAvailable && fg.granted ? await Location.getBackgroundPermissionsAsync().catch(() => null) : null;
    return { foreground: fg.granted, background: Boolean(bg?.granted), blocked: !fg.granted && fg.canAskAgain === false };
  } catch {
    return { foreground: false, background: false, blocked: false };
  }
}

/** The system's own questions, in order. Call only after the app's own explanation (Google Play's prominent disclosure). */
export async function askLocation(withBackground: boolean): Promise<LocationAccess> {
  if (!locationAvailable) return { foreground: false, background: false, blocked: false };
  const Location = location();
  const fg = await Location.requestForegroundPermissionsAsync().catch(() => null);
  if (!fg?.granted) return { foreground: false, background: false, blocked: fg?.canAskAgain === false };
  if (!withBackground || !geofenceAvailable) return { foreground: true, background: false, blocked: false };
  const bg = await Location.requestBackgroundPermissionsAsync().catch(() => null);
  return { foreground: true, background: Boolean(bg?.granted), blocked: false };
}

export const openPhoneSettings = () => void Linking.openSettings().catch(() => {});

/** Where the phone is now, for saving a place. Null when there is no fix in time. */
export async function currentPoint(): Promise<{ latitude: number; longitude: number; accuracy: number | null } | null> {
  if (!locationAvailable) return null;
  const Location = location();
  const fix = await Promise.race([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null),
    new Promise<null>((r) => setTimeout(() => r(null), 15_000)),
  ]);
  if (!fix) return null;
  return { latitude: fix.coords.latitude, longitude: fix.coords.longitude, accuracy: fix.coords.accuracy ?? null };
}

/**
 * Watches the saved places while there is something to do at one of them and "all the time" is
 * allowed; stops watching otherwise. Safe to call often: the regions are replaced, not added.
 */
export async function syncWatching(places: readonly SavedPlace[], items: readonly Item[]): Promise<"watching" | "off"> {
  if (!geofenceAvailable) return "off";
  try {
    const Location = location();
    const want = worthWatching(places, items) && (await locationAccess()).background;
    const started = await Location.hasStartedGeofencingAsync(PLACES_TASK).catch(() => false);
    if (want) {
      await Location.startGeofencingAsync(PLACES_TASK, regionsFor(places));
      return "watching";
    }
    if (started) await Location.stopGeofencingAsync(PLACES_TASK);
  } catch {
    // Expo Go on Android has no background location: the look on opening covers it.
  }
  return "off";
}

let lastLook = 0;
const LOOK_EVERY_MS = 2 * 60_000;

/**
 * The look when the app opens: one fix (the last known one when it is fresh, else a quick
 * balanced one), turned into arrivals and departures. Only with location allowed already: this
 * never asks.
 */
export async function lookAround(handle: (events: PlaceEvent[]) => Promise<void>, items: readonly Item[]): Promise<void> {
  const places = placeStore.list();
  if (!locationAvailable || !worthWatching(places, items) || Date.now() - lastLook < LOOK_EVERY_MS) return;
  lastLook = Date.now();
  const access = await locationAccess();
  if (!access.foreground) return;
  try {
    const Location = location();
    const known = await Location.getLastKnownPositionAsync({ maxAge: 2 * 60_000, requiredAccuracy: 200 }).catch(() => null);
    const fix =
      known ??
      (await Promise.race([Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 10_000))]));
    if (!fix) return;
    const here = placesHere({ latitude: fix.coords.latitude, longitude: fix.coords.longitude, accuracy: fix.coords.accuracy ?? null }, places);
    const events = changesSince(placeStore.visits(), here, places);
    if (events.length) await handle(events);
  } catch {
    // no fix: next time
  }
}
