import { AppState } from "react-native";
import { addNetworkStateListener } from "expo-network";
import { createEmitter } from "@/lib/emitter";
import { downloadModel, hasModel, partialBytes, type Download } from "./files";
import { fractionOf } from "./segments";

/**
 * Model downloads, app-wide: Settings and the chat's mic button both start them and both show
 * the same progress. One download per model at a time; it keeps going while you use the app.
 * A download that stops keeps what arrived ("paused"), carries on by itself when the connection
 * comes back, and the Download button carries on from there too.
 */
export type DownloadState =
  | { status: "idle" | "done" }
  | { status: "downloading"; fraction: number }
  | { status: "paused"; fraction: number };

const states = new Map<string, DownloadState>();
const running = new Map<string, Download>();
/** Downloads that stopped on their own in this app session: resumed when the network returns. */
const interrupted = new Map<string, { url: string; bytes: number }>();
export const downloadsChanged = createEmitter<string>();

export function downloadState(id: string, bytes: number): DownloadState {
  if (running.has(id)) return states.get(id) ?? { status: "downloading", fraction: 0 };
  if (hasModel(id, bytes)) return { status: "done" };
  const have = partialBytes(id);
  return have > 0 ? { status: "paused", fraction: fractionOf(have, bytes) } : { status: "idle" };
}

export function startDownload(id: string, url: string, bytes: number): Promise<void> {
  const existing = running.get(id);
  if (existing) return existing.promise;
  watchNetwork();
  interrupted.delete(id);
  const set = (s: DownloadState) => {
    states.set(id, s);
    downloadsChanged.emit(id);
  };
  let last = -1;
  const d = downloadModel(id, url, bytes, (fraction) => {
    // A progress event per 1% is plenty for the bar.
    if (fraction - last >= 0.01 || fraction >= 1) {
      last = fraction;
      set({ status: "downloading", fraction });
    }
  });
  running.set(id, d);
  set({ status: "downloading", fraction: fractionOf(partialBytes(id), bytes) });
  let cancelled = false;
  cancels.set(id, () => (cancelled = true));
  return d.promise
    .then(() => set({ status: "done" }))
    .catch((err) => {
      if (!cancelled) interrupted.set(id, { url, bytes });
      throw err;
    })
    .finally(() => {
      running.delete(id);
      cancels.delete(id);
      states.delete(id);
      downloadsChanged.emit(id);
    });
}

const cancels = new Map<string, () => void>();

/** Stop for now; what arrived is kept, and Download carries on from there. */
export function cancelDownload(id: string) {
  cancels.get(id)?.();
  running.get(id)?.cancel();
}

let watching = false;
const resumeInterrupted = () => {
  for (const [id, d] of interrupted) void startDownload(id, d.url, d.bytes).catch(() => {});
};
/** Carry on when the network comes back, and when the app comes back to the front (Android drops
 * the connection of an app in the background, and a switch between cell towers fires no network event). */
function watchNetwork() {
  if (watching) return;
  watching = true;
  addNetworkStateListener(({ isConnected, isInternetReachable }) => {
    if (!isConnected || isInternetReachable === false) return;
    resumeInterrupted();
  });
  AppState.addEventListener("change", (state) => {
    if (state === "active") resumeInterrupted();
  });
}
