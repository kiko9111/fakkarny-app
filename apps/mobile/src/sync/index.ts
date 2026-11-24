import { AppState } from "react-native";
import { addNetworkStateListener } from "expo-network";
import { addUserMessage, insertServerMessages, latestServerMessageAt, sqliteOutbox } from "@/db/messages";
import { getMe, listMessagesAfter, patchMe, postMessage } from "@/lib/api";
import { language } from "@/i18n";
import { prefs } from "@/lib/prefs";
import { createEmitter } from "@/lib/emitter";
import { kvGet } from "@/db/kv";
import { listScheduled } from "@/db/items";
import { ensurePermissionAndRegister, listenForNotifications, scheduleItems, setupNotifications, watchPushToken } from "@/notifications";
import { pullItems } from "./items";
import { prefetchAll } from "@/lib/prefetch";
import { createSyncQueue, type OutboxStore } from "./queue";

/** Fired whenever local messages change, so screens can reload from SQLite. */
export const messagesChanged = createEmitter<void>();
/** True while the outbox is sending (the friend is "typing"). */
export const syncBusy = createEmitter<boolean>();
/** True when the server locked chat for lack of a subscription (FR-9). */
export const chatLocked = createEmitter<boolean>();
export let isChatLocked = false;

const store: OutboxStore = {
  ...sqliteOutbox,
  async markSynced(clientId, res) {
    await sqliteOutbox.markSynced(clientId, res);
    // New or changed reminders become local notifications (they fire offline).
    await scheduleItems(res.items).catch(() => {});
  },
};

export const syncQueue = createSyncQueue({
  store,
  send: postMessage,
  onChange: () => messagesChanged.emit(),
  onBusyChange: (busy) => syncBusy.emit(busy),
  onLockedChange: (locked) => {
    if (locked !== isChatLocked) {
      isChatLocked = locked;
      chatLocked.emit(locked);
    }
  },
});

let pulling = false;
/** Fetch messages the friend started (morning, night, check-ins, follow-ups) since the last one we have. */
export async function pullMessages() {
  if (pulling) return;
  pulling = true;
  try {
    const { messages } = await listMessagesAfter(await latestServerMessageAt());
    const fromFriend = messages.filter((m) => m.role === "friend");
    if (fromFriend.length) {
      await insertServerMessages(fromFriend);
      messagesChanged.emit();
    }
  } catch {
    // offline: try again on the next foreground/network change
  } finally {
    pulling = false;
  }
}

let started = false;

/** Flush + pull on start, when the network comes back, when the app returns to the foreground, and on push. */
export function startSync() {
  if (started) return;
  started = true;
  void setupNotifications().catch(() => {});
  // Keep the push token current once the user has been asked (first ask happens after their first message).
  void kvGet("asked_notifications").then((asked) => (asked ? ensurePermissionAndRegister() : false)).catch(() => {});
  watchPushToken();
  listenForNotifications(
    () => void pullMessages(),
    // "Done" / "Later" on a reminder notification becomes a chat message, sent like any other.
    (text) =>
      void addUserMessage(text)
        .then(() => {
          messagesChanged.emit();
          return syncQueue.flush();
        })
        .catch(() => {}),
  );
  const refresh = () => {
    void syncQueue.wake();
    void pullMessages();
    // Repeating reminders are planned a day ahead: top them up whenever the app comes back.
    void listScheduled().then(scheduleItems).catch(() => {});
    // Items made or closed on the server outside the chat (circle tasks, Session steps).
    void pullItems();
    // Every tab loads in the background, so each screen opens at once with fresh numbers.
    if (prefs.get("onboarded") === "1") prefetchAll();
  };
  refresh();
  void syncLanguage();
  addNetworkStateListener(({ isConnected, isInternetReachable }) => {
    if (isConnected && isInternetReachable !== false) refresh();
  });
  AppState.addEventListener("change", (state) => {
    if (state === "active") refresh();
  });
}

/**
 * Once per start: the server writes Zaki's own lines (proactive messages, circle posts, pushes)
 * in the user's language, which onboarding used not to send. Mend it when they differ.
 */
async function syncLanguage() {
  if (prefs.get("onboarded") !== "1") return;
  try {
    const me = await getMe();
    if (me.language !== language) await patchMe({ language });
  } catch {
    // Offline or signed out: next start.
  }
}
