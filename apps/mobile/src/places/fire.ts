import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { placeKey, type ChatAction, type Item } from "@fakkarni/shared";
import { listPlaceItems } from "@/db/items";
import { addLocalFriendMessage } from "@/db/messages";
import { t } from "@/i18n";
import { checkIn, peekShopLists } from "@/lib/api";
import { QueuedOffline } from "@/sync/writes";
import { createEmitter } from "@/lib/emitter";
import { alertsFor, visit, waitingPlaces } from "./logic";
import { defineGeofenceTask, lookAround, syncWatching, type PlaceEvent } from "./native";
import { placeStore } from "./store";

/** Category and button for "tell my family I arrived" (no ":" or "-" in ids). */
export const ARRIVAL_CATEGORY = "arrival";
const ACTION_TELL = "tell";
const CHANNEL = "reminders";
const REMINDER_CATEGORY = "reminder";

/** Fired after "I've arrived" was sent, so a screen in view can say so. */
export const arrivalSent = createEmitter<{ circle: string; place: string }>();

/** The phone entered or left saved places: show what belongs there. Runs in the app or in the background task. */
export async function handlePlaceEvents(events: PlaceEvent[]): Promise<void> {
  const places = placeStore.list();
  let visits = placeStore.visits();
  const now = Date.now();
  const fire: PlaceEvent[] = [];
  for (const e of events) {
    if (!places.some((p) => p.id === e.placeId)) continue;
    const r = visit(visits, e.placeId, e.event, now);
    visits = r.next;
    if (r.fire) fire.push(e);
  }
  placeStore.setVisits(visits);
  if (!fire.length) return;
  const items = await listPlaceItems().catch(() => [] as Item[]);
  const words = { arrivedAt: t.places.arrivedAt, leftPlace: t.places.leftPlace, listCount: t.places.listCount, arrivalTitle: t.places.arrivalTitle, arrivalBody: t.places.arrivalBody };
  for (const e of fire) {
    const place = places.find((p) => p.id === e.placeId)!;
    const lists = e.event === "enter" ? peekShopLists(place.kind) : [];
    for (const a of alertsFor(place, e.event, items, places, lists, words)) {
      await Notifications.scheduleNotificationAsync({
        identifier: a.identifier,
        content: {
          title: a.title,
          body: a.body,
          data: a.data,
          sound: true,
          ...(a.kind === "reminder" ? { categoryIdentifier: REMINDER_CATEGORY } : a.kind === "arrival" ? { categoryIdentifier: ARRIVAL_CATEGORY } : {}),
        },
        trigger: Platform.OS === "android" ? { channelId: CHANNEL } : null,
      }).catch(() => {});
    }
  }
}

// The geofence task, defined as the bundle loads (also when the system wakes the app only for it).
defineGeofenceTask(handlePlaceEvents);

/** The arrival button and the list notification's tap. Returns true when it handled the response. */
export async function answerPlaceTap(res: Notifications.NotificationResponse): Promise<boolean> {
  const data = res.notification.request.content.data as { type?: string; circleId?: string; place?: string; route?: string } | undefined;
  if (data?.type === "place" && data.route) {
    router.navigate(data.route as never);
    return true;
  }
  if (data?.type !== "arrival" || !data.circleId) return false;
  const place = placeStore.list().find((p) => p.arrival?.circle_id === data.circleId && p.name === data.place);
  if (res.actionIdentifier === ACTION_TELL) {
    void Notifications.dismissNotificationAsync(res.notification.request.identifier).catch(() => {});
    try {
      await checkIn(data.circleId, "arrived", data.place);
    } catch (err) {
      // Offline: kept and sent when the phone is back online (lib/api.ts writeOrQueue).
      if (!(err instanceof QueuedOffline)) return true;
    }
    arrivalSent.emit({ circle: place?.arrival?.circle_name ?? "", place: data.place ?? "" });
  }
  router.navigate(`/circle/${data.circleId}` as never);
  return true;
}

export async function setupPlaceNotifications(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(ARRIVAL_CATEGORY, [{ identifier: ACTION_TELL, buttonTitle: t.places.arrivalTell, options: { opensAppToForeground: true } }]);
}

/**
 * On every return to the app and whenever plans change: watch the places that have something to
 * do, look around once (catches arrivals the system missed, and is all Expo Go can do), and ask
 * in the chat, once per place, for any place a reminder waits on that is not saved yet.
 */
export async function refreshPlaces(chatChanged: () => void = () => {}): Promise<void> {
  const items = await listPlaceItems().catch(() => [] as Item[]);
  const places = placeStore.list();
  await syncWatching(places, items);
  await lookAround(handlePlaceEvents, items);
  const waiting = waitingPlaces(items, places);
  for (const words of waiting) {
    const action: ChatAction = { id: `place:${placeKey(words)}`, kind: "open_place", status: "done", label: t.places.chatOpen, route: "/places" };
    await addLocalFriendMessage(`local:place:${placeKey(words)}`, t.places.chatWaiting.replace("{place}", words), [action]).catch(() => {});
  }
  if (waiting.length) chatChanged();
}
