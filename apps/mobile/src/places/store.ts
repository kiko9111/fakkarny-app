import { useSyncExternalStore } from "react";
import "@/lib/storage";
import { parsePlaces, parseVisits, pruneVisits, type SavedPlace, type VisitState } from "./logic";

/**
 * Saved places live in this phone's storage only (never synced, never sent): the coordinates of
 * someone's home, school or work are the most sensitive thing the app could hold, so they stay
 * here. Wiped with the rest of the phone's data (db/reset.ts).
 */
const KEY = "places:v1";
const VISITS = "places:visits";

const listeners = new Set<() => void>();
let cache: SavedPlace[] | null = null;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // storage unavailable: the place lives until the app closes
  }
}

export const placeStore = {
  list(): SavedPlace[] {
    cache ??= parsePlaces(read(KEY));
    return cache;
  },
  save(next: SavedPlace[]) {
    cache = next;
    write(KEY, JSON.stringify(next));
    write(VISITS, JSON.stringify(pruneVisits(parseVisits(read(VISITS)), next)));
    listeners.forEach((l) => l());
  },
  visits(): VisitState {
    return parseVisits(read(VISITS));
  },
  setVisits(v: VisitState) {
    write(VISITS, JSON.stringify(v));
  },
  /** A headless task (the geofence firing with the app closed) reads storage fresh. */
  reload() {
    cache = null;
  },
  clear() {
    cache = [];
    write(KEY, null);
    write(VISITS, null);
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function usePlaces(): SavedPlace[] {
  return useSyncExternalStore(placeStore.subscribe, placeStore.list, placeStore.list);
}
