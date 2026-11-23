import { useSyncExternalStore } from "react";
import type { ChatAction } from "@fakkarni/shared";
import { addLocalFriendMessage } from "@/db/messages";
import { t } from "@/i18n";
import { track } from "@/lib/analytics";
import { messagesChanged } from "@/sync";
import { prefs } from "./prefs";
import { afterMessage, ALL_FEATURES, FEATURE_ROUTE, localDayOf, open, parseUnlock, type Feature, type UnlockState } from "./unlock";

/**
 * Which places are open (see unlock.ts). Kept in prefs so the tab bar is right on the first
 * frame. No saved value means a user from before chat-first: everything stays open.
 * Zaki introduces each place in the chat with an Open card (src/chat/ActionCards.tsx opens it).
 */
const listeners = new Set<() => void>();
let state: UnlockState | null = parseUnlock(prefs.get("unlocked"));

const INTRO: Record<Feature, string> = { daftar: t.ui.introDaftar, people: t.ui.introPeople, today: t.ui.introToday };
const OPENED_LINE: Record<Feature, string> = { daftar: t.ui.openedDaftar, people: t.ui.openedPeople, today: t.ui.openedToday };
const OPEN_LABEL: Record<Feature, string> = { daftar: t.ui.openDaftar, people: t.ui.openPeople, today: t.ui.openToday };

const card = (f: Feature): ChatAction => ({ id: `intro:${f}`, kind: "open_place", status: "done", label: OPEN_LABEL[f], route: FEATURE_ROUTE[f] });

function save(next: UnlockState) {
  state = next;
  prefs.set("unlocked", JSON.stringify(state));
  listeners.forEach((l) => l());
}

async function write(clientId: string, text: string, actions: ChatAction[]) {
  await addLocalFriendMessage(clientId, text, actions);
  messagesChanged.emit();
}

export const unlock = {
  /** New users start with only the chat. */
  startFresh() {
    save({ features: [], offered: [], days: [] });
  },
  /**
   * Records a user message. Returns what Zaki should say about it, to call once the message
   * has been sent (so Zaki's note lands after his reply).
   */
  onUserMessage(text: string): () => Promise<void> {
    if (!state) return async () => {};
    const step = afterMessage(state, text, localDayOf(new Date()));
    save(step.state);
    const stamp = Date.now();
    return async () => {
      if (step.overview) {
        track("place_overview");
        await write(`local:overview:${stamp}`, t.ui.introAll, ALL_FEATURES.map(card));
        return;
      }
      for (const f of step.introduce) {
        const asked = step.opened.includes(f);
        track(asked ? "place_opened" : "place_introduced", { place: f, via: asked ? "ask" : "zaki" });
        await write(`local:intro:${f}:${stamp}`, asked ? OPENED_LINE[f] : INTRO[f], [card(f)]);
      }
    };
  },
  open(feature: Feature) {
    if (!state) return;
    const next = open(state, feature);
    if (!next.opened.length) return;
    track("place_opened", { place: feature, via: "tap" });
    save(next.state);
  },
  isOpen(feature: Feature): boolean {
    return !state || state.features.includes(feature);
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
