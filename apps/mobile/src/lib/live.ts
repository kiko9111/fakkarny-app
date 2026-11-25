import { useCallback, useRef } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { createEmitter } from "./emitter";
import { LIVE_DEBOUNCE_MS, LIVE_EVERY_MS, shouldPoll } from "./live-plan";

/**
 * Fired when something may have changed on the server: a chat reply arrived (Zaki may have logged
 * money, made a tracker, sent a task), new messages were pulled, offline taps went out, a card was
 * tapped. Screens that are open reload at once instead of waiting for the next visit.
 */
export const dataChanged = createEmitter<void>();

/**
 * Like useFocusEffect for a screen's load: runs when the screen comes into view, again whenever
 * `dataChanged` fires while it is in view, and every LIVE_EVERY_MS while it is in view and the app
 * is open (news from other people: circle posts, tasks, Daftar answers). Bursts are merged.
 */
export function useLive(load: () => unknown) {
  const ref = useRef(load);
  ref.current = load;
  useFocusEffect(
    useCallback(() => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      let last = Date.now();
      const run = () => {
        last = Date.now();
        void Promise.resolve(ref.current()).catch(() => {});
      };
      const soon = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(run, LIVE_DEBOUNCE_MS);
      };
      run();
      const off = dataChanged.subscribe(soon);
      const poll = setInterval(() => {
        if (shouldPoll({ active: AppState.currentState === "active", now: Date.now(), last })) run();
      }, LIVE_EVERY_MS / 2);
      return () => {
        off();
        clearInterval(poll);
        if (timer) clearTimeout(timer);
      };
    }, []),
  );
}
