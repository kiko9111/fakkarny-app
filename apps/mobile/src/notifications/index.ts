import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import type { Item } from "@fakkarni/shared";
import { kvGet, kvSet } from "@/db/kv";
import { upsertItem } from "@/db/messages";
import { t } from "@/i18n";
import { patchItem, registerDevice } from "@/lib/api";
import { clearId, fill, hintId, planReminderNotifications } from "./plan";

const CATEGORY = "reminder"; // no ":" or "-" in category ids
const ACTION_DONE = "done";
const ACTION_LATER = "later";
const CHANNEL = "reminders";

/** Call once at startup: how notifications show, the Android channel, and reminder quick replies. */
export async function setupNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: t.notifications.channel,
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  await Notifications.setNotificationCategoryAsync(CATEGORY, [
    { identifier: ACTION_DONE, buttonTitle: t.notifications.done, options: { opensAppToForeground: false } },
    { identifier: ACTION_LATER, buttonTitle: t.notifications.later, options: { opensAppToForeground: false } },
  ]);
}

/**
 * Ask for permission ("so I can check on you", F1) and register the push token.
 * Remote push needs a development build and an EAS projectId; local reminders work without either.
 */
export async function ensurePermissionAndRegister(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  let granted = current.granted;
  if (!granted && current.canAskAgain) granted = (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return false;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!Device.isDevice || !projectId) return true;
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if ((await kvGet("push_token")) !== token) {
      await registerDevice({ platform: Platform.OS === "ios" ? "ios" : "android", push_token: token });
      await kvSet("push_token", token);
    }
  } catch {
    // Expo Go on Android or no network: local reminders still work; retry next launch.
  }
  return true;
}

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** (Re)schedule an item's local notifications; cancels them when it's done or cancelled. */
export async function scheduleItem(item: Item) {
  await Notifications.cancelScheduledNotificationAsync(hintId(item.id)).catch(() => {});
  await Notifications.cancelScheduledNotificationAsync(clearId(item.id)).catch(() => {});
  if (item.type !== "reminder" && item.type !== "task") return;
  const alwaysDirect = (await kvGet("always_direct")) === "1";
  const planned = planReminderNotifications(item, {
    now: new Date(),
    alwaysDirect,
    clearText: (title, due) => fill(t.notifications.clear, { title, time: formatTime(due) }),
  });
  for (const n of planned) {
    await Notifications.scheduleNotificationAsync({
      identifier: n.identifier,
      content: {
        title: "Fakkarni",
        body: n.body,
        categoryIdentifier: CATEGORY,
        data: { type: "reminder", itemId: item.id, title: item.title },
        sound: true,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.date, channelId: CHANNEL },
    });
  }
}

export async function scheduleItems(items: Item[]) {
  for (const item of items) await scheduleItem(item);
}

/**
 * Quick replies on reminders (FR-6: "replies update the item"), plus tap-to-open-chat.
 * `onMessage` pulls new friend messages when a push arrives.
 */
export function listenForNotifications(onMessage: () => void) {
  const received = Notifications.addNotificationReceivedListener((n) => {
    if (n.request.content.data?.["type"] === "message") onMessage();
  });
  const response = Notifications.addNotificationResponseReceivedListener(async (res) => {
    const data = res.notification.request.content.data as { type?: string; itemId?: string; title?: string } | undefined;
    if (res.actionIdentifier === ACTION_DONE && data?.itemId) {
      try {
        const item = await patchItem(data.itemId, { status: "done" });
        await upsertItem(item);
        await scheduleItem(item);
      } catch {
        // Offline: keep it open; the friend will ask about it later.
      }
    } else if (res.actionIdentifier === ACTION_LATER && data?.itemId) {
      await Notifications.scheduleNotificationAsync({
        identifier: hintId(data.itemId),
        content: { title: "Fakkarni", body: res.notification.request.content.body ?? data.title ?? "", categoryIdentifier: CATEGORY, data, sound: true },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(Date.now() + 60 * 60_000), channelId: CHANNEL },
      });
    } else {
      if (data?.type === "message") onMessage();
      router.navigate("/");
    }
  });
  return () => {
    received.remove();
    response.remove();
  };
}
