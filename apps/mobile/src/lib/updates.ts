import { AppState } from "react-native";
import * as Updates from "expo-updates";

/** Expo asks apps not to check in a tight loop: at most every 10 minutes, on start and on return. */
const CHECK_EVERY_MS = 10 * 60_000;

let lastCheck = 0;
let ready = false;
let started = false;

async function check() {
  if (ready || Date.now() - lastCheck < CHECK_EVERY_MS) return;
  lastCheck = Date.now();
  try {
    const found = await Updates.checkForUpdateAsync();
    if (!found.isAvailable) return;
    const fetched = await Updates.fetchUpdateAsync();
    if (fetched.isNew) ready = true;
  } catch {
    // Offline, Expo Go or a development build: the next start picks it up as before.
  }
}

async function apply() {
  if (!ready) return;
  try {
    await Updates.reloadAsync();
  } catch {
    // Try again on the next switch.
  }
}

/**
 * Fixes sent over the air used to wait for the app to be closed and opened again. Now the app
 * looks for one when it starts and whenever it comes back, downloads it in the background, and
 * switches to it the next time the user leaves the app (so nothing jumps while they use it).
 */
export function startUpdates() {
  if (started || __DEV__ || !Updates.isEnabled) return;
  started = true;
  void check();
  AppState.addEventListener("change", (state) => {
    if (state === "active") void check();
    else if (state === "background") void apply();
  });
}

/** What is running, for Me > Advanced: the update's short id and date, or "built in". */
export function runningUpdate(): { id: string | null; at: Date | null; channel: string | null } {
  if (__DEV__ || !Updates.isEnabled) return { id: null, at: null, channel: null };
  return {
    id: Updates.isEmbeddedLaunch ? null : (Updates.updateId ?? null),
    at: Updates.createdAt ?? null,
    channel: Updates.channel ?? null,
  };
}

/**
 * "Update now": asks, downloads and switches at once, and says what happened instead of hiding
 * it ("none" = nothing newer; "off" = this build takes no updates; else the error's words).
 */
export async function updateNow(): Promise<"reloading" | "none" | "off" | { error: string }> {
  if (__DEV__ || !Updates.isEnabled) return "off";
  try {
    const found = await Updates.checkForUpdateAsync();
    if (!found.isAvailable) {
      // Any other reason is worth reading on the screen (e.g. an update that failed to start).
      const why = found.reason ? String(found.reason) : "";
      return !why || why === "noUpdateAvailableOnServer" ? "none" : { error: why };
    }
    await Updates.fetchUpdateAsync();
    await Updates.reloadAsync();
    return "reloading";
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
