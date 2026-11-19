import { AppState } from "react-native";
import { addNetworkStateListener } from "expo-network";
import { sqliteOutbox } from "@/db/messages";
import { postMessage } from "@/lib/api";
import { createEmitter } from "@/lib/emitter";
import { createSyncQueue } from "./queue";

/** Fired whenever local messages change, so screens can reload from SQLite. */
export const messagesChanged = createEmitter<void>();
/** True while the outbox is sending (the friend is "typing"). */
export const syncBusy = createEmitter<boolean>();

export const syncQueue = createSyncQueue({
  store: sqliteOutbox,
  send: postMessage,
  onChange: () => messagesChanged.emit(),
  onBusyChange: (busy) => syncBusy.emit(busy),
});

let started = false;

/** Flush on start, when the network comes back, and when the app returns to the foreground. */
export function startSync() {
  if (started) return;
  started = true;
  void syncQueue.flush();
  addNetworkStateListener(({ isConnected, isInternetReachable }) => {
    if (isConnected && isInternetReachable !== false) void syncQueue.wake();
  });
  AppState.addEventListener("change", (state) => {
    if (state === "active") void syncQueue.wake();
  });
}
