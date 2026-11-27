import { dosesToAnswer, MAX_DOSE_TIMES, nextDose, type CareDose, type CareMed } from "@fakkarni/shared";

/**
 * Care circles on the phone: what a circle's tile and Today say, and the form's time picks.
 * Pure (no react-native), so it is tested with vitest.
 */

/** Times offered as one tap on the form. */
export const TIME_CHOICES = ["08:00", "14:00", "20:00", "22:00"] as const;

/** Tap a time on or off; at most MAX_DOSE_TIMES, kept in order. */
export function toggleTime(times: readonly string[], time: string): string[] {
  if (times.includes(time)) return times.filter((x) => x !== time);
  if (times.length >= MAX_DOSE_TIMES) return [...times];
  return [...times, time].sort();
}

/** "HH:MM" from a picked Date's local clock. */
export const hhmmOf = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

export interface CareSummary {
  /** Medicines in this circle (all, paused too). */
  count: number;
  /** Doses still to take today (due or later). */
  left: number;
  /** Doses that wait for an answer (missed today, or earlier). */
  missed: number;
  /** The next dose's local time today, or null. */
  next: string | null;
}

/** The circle tile: how many medicines, what is left today, what nobody marked. */
export function careSummary(meds: readonly CareMed[] | null, circleId: string): CareSummary {
  const mine = (meds ?? []).filter((m) => m.circle_id === circleId);
  let left = 0;
  let missed = 0;
  let next: CareDose | null = null;
  for (const m of mine) {
    if (!m.active) continue;
    left += m.today.filter((d) => d.state === "due" || d.state === "later").length;
    missed += dosesToAnswer(m).length;
    const n = nextDose(m);
    if (n && (!next || n.due_at < next.due_at)) next = n;
  }
  return { count: mine.length, left, missed, next: next?.time ?? null };
}

export interface DoseToAnswer {
  med: CareMed;
  dose: CareDose;
}

/** Every dose nobody marked across the user's circles, oldest first (Today's "Needs you"). */
export function careToAnswer(meds: readonly CareMed[] | null): DoseToAnswer[] {
  return (meds ?? []).flatMap((med) => dosesToAnswer(med).map((dose) => ({ med, dose }))).sort((a, b) => a.dose.due_at.localeCompare(b.dose.due_at));
}

/** Can this dose be tapped "Taken" now? Its time came (or is within the hour), and it was not a day ago. */
export function canTap(dose: CareDose, now: Date): boolean {
  const ago = now.getTime() - Date.parse(dose.due_at);
  return ago >= -60 * 60_000 && ago <= 24 * 3_600_000;
}
