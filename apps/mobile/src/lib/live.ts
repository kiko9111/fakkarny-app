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
      let alive = true;
      let last = Date.now();
      // One load at a time: on a slow connection the 30 s poll and change signals must not pile
      // requests on top of one still waiting. A call that lands meanwhile runs once after.
      let running = false;
      let again = false;
      const run = () => {
        last = Date.now();
        if (running) {
          again = true;
          return;
        }
        running = true;
        void Promise.resolve()
          .then(() => ref.current())
          .catch(() => {})
          .finally(() => {
            running = false;
            if (again && alive) {
              again = false;
              run();
            }
          });
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
        alive = false;
        off();
        clearInterval(poll);
        if (timer) clearTimeout(timer);
      };
    }, []),
  );
}
