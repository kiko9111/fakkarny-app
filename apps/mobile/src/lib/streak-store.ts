import { useSyncExternalStore } from "react";
import { prefs } from "./prefs";
import { parseStreak, recordDay, streakOf, type StreakState } from "./streak";
import { localDayOf } from "./unlock";

/** The Zaki streak (see streak.ts), kept in prefs so the header shows it on the first frame. */
const listeners = new Set<() => void>();
let state: StreakState = parseStreak(prefs.get("streak"));

export const streak = {
  /** A user message today. Returns the milestone reached, if any. */
  record(now = new Date()): number | null {
    const step = recordDay(state, localDayOf(now));
    state = step.state;
    prefs.set("streak", JSON.stringify(state));
    listeners.forEach((l) => l());
    return step.milestone;
  },
  count(now = new Date()): number {
    return streakOf(state.days, localDayOf(now)).count;
  },
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => streak.count();

/** Days in a row, re-rendering when today's message lands. */
export function useStreak(): number {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
