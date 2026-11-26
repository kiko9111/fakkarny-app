import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import type { Item } from "@fakkarni/shared";
import { itemStatuses } from "@/db/items";
import { kvGet, kvSet } from "@/db/kv";
import { oneAtATime } from "@/lib/one-at-a-time";
import { prefs } from "@/lib/prefs";
import { itemsChanged } from "@/lib/signals";
import { upsertItem } from "@/db/messages";
import { t, dateLocale } from "@/i18n";
import { patchItem, registerDevice } from "@/lib/api";
import { awakeAtMinutes } from "@fakkarni/shared";
import { fill, legacyIds, planReminderNotifications, snoozeId, type PlannedNotification } from "./plan";
import { signature } from "./reconcile";
import { createScheduler, listedAt, type NotificationHost } from "./scheduler";
import { shownItemId, staleShown } from "./shade";

const CATEGORY = "reminder"; // no ":" or "-" in category ids
const ACTION_DONE = "done";
const ACTION_LATER = "later";
const CHANNEL = "reminders";
/** Zaki's own messages sent as push by the server (proactive/push.ts sends this channelId). */
const MESSAGES_CHANNEL = "messages";
/** Re-send the token now and then, so the server has it even if its copy was lost. */
const REREGISTER_MS = 7 * 86400_000;
/** Alarm-style reminders the user asked for. A full-screen alarm needs a new native build; this is the loudest a notification can be. */
const ALARM_CHANNEL = "alarms";

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
    await Notifications.setNotificationChannelAsync(MESSAGES_CHANNEL, {
      name: t.notifications.messagesChannel,
      importance: Notifications.AndroidImportance.HIGH,
    });
    await Notifications.setNotificationChannelAsync(ALARM_CHANNEL, {
      name: t.notifications.alarmChannel,
      importance: Notifications.AndroidImportance.MAX,
      bypassDnd: true,
      vibrationPattern: [0, 600, 300, 600, 300, 600],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      sound: "default",
    });
  }
  await Notifications.setNotificationCategoryAsync(CATEGORY, [
    { identifier: ACTION_DONE, buttonTitle: t.notifications.done, options: { opensAppToForeground: false } },
    { identifier: ACTION_LATER, buttonTitle: t.notifications.later, options: { opensAppToForeground: false } },
  ]);
}

/**
 * Ask for permission ("so I can check on you", F1) and register the push token.
 * Remote push needs a build with Firebase set up (google-services.json, see app.config.js) and an
 * EAS projectId; local reminders work without either. `force` re-sends the token (after sign-in).
 */
export async function ensurePermissionAndRegister(opts: { force?: boolean } = {}): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  let granted = current.granted;
  if (!granted && current.canAskAgain) granted = (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return false;
  await registerPushToken(opts.force ?? false);
  return true;
}

async function registerPushToken(force: boolean) {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!Device.isDevice || !projectId) return;
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const last = Number((await kvGet("push_token_at")) ?? 0);
    if (force || (await kvGet("push_token")) !== token || Date.now() - last > REREGISTER_MS) {
      await registerDevice({ platform: Platform.OS === "ios" ? "ios" : "android", push_token: token });
      await kvSet("push_token", token);
      await kvSet("push_token_at", String(Date.now()));
    }
  } catch {
    // Expo Go on Android, a build without Firebase, or no network: local reminders still work; retry next launch.
  }
}

let watchingToken = false;

/** The OS can rotate the push token; send the new one when it does. */
export function watchPushToken() {
  if (watchingToken) return;
  watchingToken = true;
  Notifications.addPushTokenListener(() => void registerPushToken(true));
}

function formatTime(d: Date) {
  return d.toLocaleTimeString(dateLocale, { hour: "numeric", minute: "2-digit" });
}

/** The phone's own clock and the server's default waking hours (07:00–23:00). */
function planFor(item: Item, now: Date): PlannedNotification[] {
  return planReminderNotifications(item, {
    now,
    alwaysDirect: prefs.get("always_direct") === "1",
    clearText: (title, due) => fill(t.notifications.clear, { title, time: formatTime(due) }),
    followupText: (title) => fill(t.notifications.followup, { title }),
    awake: (at) => awakeAtMinutes(at.getHours() * 60 + at.getMinutes(), "07:00", "23:00"),
  });
}

/** What this app scheduled (identifier → signature), so a launch knows what is already there. */
const RECORD_KEY = "notif:scheduled";

const host: NotificationHost = {
  list: async () => (await Notifications.getAllScheduledNotificationsAsync()).map((r) => ({ identifier: r.identifier, at: listedAt(r.trigger) })),
  schedule: async (n, item) => {
    await Notifications.scheduleNotificationAsync({
      identifier: n.identifier,
      content: {
        title: "Zaki",
        body: n.body,
        // A follow-up is a question to answer in the chat, so it has no Done / Later buttons.
        ...(n.kind === "followup" ? {} : { categoryIdentifier: CATEGORY }),
        data: { type: n.kind === "followup" ? "followup" : "reminder", itemId: item.id, title: item.title, repeating: Boolean(item.repeat_every_minutes) },
        sound: true,
        ...(n.alarm ? { priority: Notifications.AndroidNotificationPriority.MAX, interruptionLevel: "timeSensitive" as const } : {}),
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.date, channelId: n.alarm ? ALARM_CHANNEL : CHANNEL },
    });
  },
  cancel: (id) => Notifications.cancelScheduledNotificationAsync(id),
  load: () => {
    const raw = localStorage.getItem(RECORD_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : null;
  },
  save: (record) => localStorage.setItem(RECORD_KEY, JSON.stringify(record)),
  legacy: legacyIds,
};

const scheduler = createScheduler({ host, plan: planFor });

/**
 * (Re)plan an item's local notifications in the background (none when it is done or cancelled).
 * Never awaited on the user's path: on Android every notification call is a trip through the
 * system, and screens, the chat and the server must not wait for them.
 */
export function scheduleItem(item: Item): void {
  void scheduleItems([item], true);
}

/** `soon`: ahead of a bulk top-up (a reminder just made or changed). Resolves when they are planned. */
export function scheduleItems(items: readonly Item[], soon = false): Promise<void> {
  const planned = scheduler.enqueue(items, soon);
  // A plan was closed: its reminders still in the notification shade go too.
  if (items.some((i) => i.status !== "open")) void tidyShade();
  return planned;
}

/**
 * Takes reminders that no longer help out of the notification shade (shade.ts): every one of a
 * closed plan, and an open plan's older ones. In the background, one run at a time: nothing waits
 * for it.
 */
export const tidyShade = oneAtATime(async () => {
  try {
    const shown = (await Notifications.getPresentedNotificationsAsync()).map((n) => ({ identifier: n.request.identifier, date: n.date }));
    const ids = [...new Set(shown.map((n) => shownItemId(n.identifier)).filter((id): id is string => id !== null))];
    if (!ids.length) return;
    const status = await itemStatuses(ids);
    for (const id of staleShown(shown, (itemId) => status.get(itemId))) await Notifications.dismissNotificationAsync(id).catch(() => {});
  } catch {
    // The phone can't list them (Android 5) or the database is busy: the next refresh tries again.
  }
});

/**
 * Cancel every local notification and clear the shade (the phone is being wiped). Plans that
 * arrive meanwhile are the last person's and are dropped.
 */
export async function clearScheduled(): Promise<void> {
  scheduler.reset();
  try {
    await scheduler.idle();
    await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
    await Notifications.dismissAllNotificationsAsync().catch(() => {});
  } finally {
    scheduler.reopen();
  }
}

/**
 * Quick replies on reminders (FR-6: "replies update the item"), plus tap-to-open-chat.
 * `onMessage` pulls new friend messages when a push arrives.
 */
export function listenForNotifications(onMessage: () => void, say: (text: string) => void) {
  // The server writes each reminder into the chat within a minute of its time: pull now and again shortly.
  const pullSoon = () => {
    onMessage();
    setTimeout(onMessage, 20_000);
    setTimeout(onMessage, 75_000);
  };
  // A reminder shown while the app is open: the plan's older one leaves the shade (an hourly
  // reminder would stack up). A moment later, so the new one is surely in the shade by then.
  const tidySoon = () => setTimeout(() => void tidyShade(), 1500);
  const received = Notifications.addNotificationReceivedListener((n) => {
    const type = n.request.content.data?.["type"];
    if (type === "message") onMessage();
    if (type === "reminder" || type === "followup") pullSoon();
    if (type === "reminder") tidySoon();
  });
  const response = Notifications.addNotificationResponseReceivedListener(async (res) => {
    const data = res.notification.request.content.data as { type?: string; itemId?: string; title?: string; repeating?: boolean } | undefined;
    if (data?.type === "reminder" || data?.type === "followup") pullSoon();
    // Android keeps a notification in the shade after Done or Later on it: it goes now.
    const tapped = res.notification.request.identifier;
    if ((res.actionIdentifier === ACTION_DONE || res.actionIdentifier === ACTION_LATER) && data?.itemId) {
      void Notifications.dismissNotificationAsync(tapped).catch(() => {});
    }
    if (res.actionIdentifier === ACTION_DONE && data?.itemId) {
      // Everything goes through the conversation: the answer shows in the chat and the friend replies.
      if (data.title) say(fill(t.notifications.doneSay, { title: data.title }));
      // "Done" on a repeating reminder means this time only: it stays open and keeps repeating.
      if (data.repeating) return;
      try {
        const item = await patchItem(data.itemId, { status: "done" });
        if (await upsertItem(item)) itemsChanged.emit();
        // Closed: its other reminders leave the shade too (scheduleItems tidies it).
        scheduleItem(item);
      } catch {
        // Offline: keep it open; the friend will ask about it later.
      }
    } else if (res.actionIdentifier === ACTION_LATER && data?.itemId) {
      if (data.title) say(fill(t.notifications.laterSay, { title: data.title }));
      // Its own identifier: re-planning the item leaves it alone, and closing the item clears it.
      const identifier = snoozeId(data.itemId);
      const body = res.notification.request.content.body ?? data.title ?? "";
      const date = new Date(Date.now() + 60 * 60_000);
      await Notifications.scheduleNotificationAsync({
        identifier,
        content: { title: "Zaki", body, categoryIdentifier: CATEGORY, data, sound: true },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: CHANNEL },
      });
      scheduler.remember(identifier, signature({ date, kind: "hint", body }));
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
