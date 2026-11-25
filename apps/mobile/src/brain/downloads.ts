import { createEmitter } from "@/lib/emitter";
import { downloadModel, hasModel, type Download } from "./files";

/**
 * Model downloads, app-wide: Settings and the chat's mic button both start them and both show
 * the same progress. One download per model at a time; it keeps going while you use the app.
 */
export type DownloadState = { status: "idle" | "done" } | { status: "downloading"; fraction: number } | { status: "failed" };

const states = new Map<string, DownloadState>();
const running = new Map<string, Download>();
export const downloadsChanged = createEmitter<string>();

export function downloadState(id: string, bytes: number): DownloadState {
  if (running.has(id)) return states.get(id) ?? { status: "downloading", fraction: 0 };
  if (hasModel(id, bytes)) return { status: "done" };
  return states.get(id)?.status === "failed" ? { status: "failed" } : { status: "idle" };
}

export function startDownload(id: string, url: string): Promise<void> {
  const existing = running.get(id);
  if (existing) return existing.promise;
  const set = (s: DownloadState) => {
    states.set(id, s);
    downloadsChanged.emit(id);
  };
  let last = 0;
  const d = downloadModel(id, url, (fraction) => {
    // A progress event per 1% is plenty for the bar.
    if (fraction - last >= 0.01 || fraction >= 1) {
      last = fraction;
      set({ status: "downloading", fraction });
    }
  });
  running.set(id, d);
  set({ status: "downloading", fraction: 0 });
  return d.promise
    .then(() => set({ status: "done" }))
    .catch((err) => {
      set({ status: "failed" });
      throw err;
    })
    .finally(() => {
      running.delete(id);
      downloadsChanged.emit(id);
    });
}

export function cancelDownload(id: string) {
  running.get(id)?.cancel();
}
