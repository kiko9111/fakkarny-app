import { isAwake, localToUtc, toLocalIso } from "../lib/time";

/**
 * When the proactive tick should look at a user again (pure). The tick only loads users whose
 * `next_tick_at` has passed, so this decides how much work each minute does.
 *
 * - Awake: every IDLE_MIN minutes. Every awake-time sender (morning within 30 min of waking,
 *   night from an hour before sleep, check-ins, status checks, tracker questions within 30 min
 *   of their time, Friday check-up, gift, memory moments) has a window much longer than that.
 * - Asleep: at wake time. Nothing Zaki starts on his own goes out while the user sleeps.
 * - Daily budget spent: at local midnight, when it starts over.
 *
 * Reminders and follow-ups the user asked for don't wait for this: the tick also picks up
 * anyone with an item whose remind_at or follow_up_at just passed (runTick, DUE_ITEM_WINDOW_MIN).
 * Changing time zone or waking hours clears `next_tick_at` (routes/me.ts, routes/messages.ts).
 */
export const IDLE_MIN = 10;

export interface ScheduleUser {
  timezone: string;
  wakeTime: string;
  sleepTime: string;
}

function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** The next instant strictly after `now` when the local clock reads `hhmm`. */
export function nextLocalTime(now: Date, tz: string, hhmm: string): Date {
  const today = toLocalIso(now, tz).slice(0, 10);
  const at = localToUtc(`${today}T${hhmm}`, tz);
  return at > now ? at : localToUtc(`${nextDay(today)}T${hhmm}`, tz);
}

export function nextTickAt(user: ScheduleUser, now: Date, opts: { budgetSpent?: boolean } = {}): Date {
  const idle = new Date(now.getTime() + IDLE_MIN * 60_000);
  if (!isAwake(now, user.timezone, user.wakeTime, user.sleepTime)) {
    return clamp(nextLocalTime(now, user.timezone, user.wakeTime), now);
  }
  if (opts.budgetSpent) return clamp(nextLocalTime(now, user.timezone, "00:00"), now);
  return idle;
}

/** At least a minute and at most a day from now. */
function clamp(at: Date, now: Date): Date {
  return new Date(Math.min(now.getTime() + 24 * 3600_000, Math.max(now.getTime() + 60_000, at.getTime())));
}
