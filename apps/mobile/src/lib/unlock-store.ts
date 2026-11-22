import { useSyncExternalStore } from "react";
import { t } from "@/i18n";
import { notify } from "@/ui/feedback";
import { prefs } from "./prefs";
import { afterMessage, ALL_FEATURES, localDayOf, open, parseUnlock, type Feature, type UnlockState } from "./unlock";

/**
 * Which places are open (see unlock.ts). Kept in prefs so the tab bar is right on the first
 * frame. No saved value means a user from before chat-first: everything stays open.
 */
const listeners = new Set<() => void>();
let state: UnlockState | null = parseUnlock(prefs.get("unlocked"));

const OPENED_LINE: Record<Feature, string> = { daftar: t.ui.openedDaftar, people: t.ui.openedPeople, today: t.ui.openedToday };

function commit(next: { state: UnlockState; opened: Feature[] }) {
  if (!next.opened.length && next.state === state) return;
  state = next.state;
  prefs.set("unlocked", JSON.stringify(state));
  listeners.forEach((l) => l());
  if (next.opened.length) notify(OPENED_LINE[next.opened[0]!]);
}

export const unlock = {
  /** New users start with only the chat. */
  startFresh() {
    state = { features: [], days: [] };
    prefs.set("unlocked", JSON.stringify(state));
    listeners.forEach((l) => l());
  },
  onUserMessage(text: string) {
    if (!state) return;
    commit(afterMessage(state, text, localDayOf(new Date())));
  },
  open(feature: Feature) {
    if (!state) return;
    commit(open(state, feature));
  },
  features(): Feature[] {
    return state ? state.features : ALL_FEATURES;
  },
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => (state ? state.features.join(",") : "all");

/** The open places, re-rendering when one opens. */
export function useUnlocked(): Feature[] {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  return unlock.features();
}
