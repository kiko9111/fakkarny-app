import { z } from "zod";
import { TimeOfDay } from "./entities";

/**
 * Care circles (2026-11-27, owner ask "care circle for parents' medicine"): brothers and sisters
 * share one person's medicine times (often a parent). At each time Zaki reminds the people who
 * were picked; the parent or anyone in the circle taps "Taken"; a dose nobody marked a while
 * after its time is told to the rest of the family. Reminders and records only: Zaki never
 * suggests a medicine, a dose or a change, and the words are the family's own (from the
 * doctor's note). Free, like every shared feature; no AI call anywhere in it.
 */

export const MAX_MEDS_PER_CIRCLE = 30;
export const MAX_DOSE_TIMES = 6;
export const MED_NAME_MAX = 60;
export const MED_DOSE_MAX = 60;
export const MED_PERSON_MAX = 40;
export const MED_NOTE_MAX = 200;
/** "Tell the family if it isn't marked within…" choices, in minutes. */
export const MISSED_AFTER_CHOICES = [30, 60, 120] as const;
export const MIN_MISSED_AFTER = 15;
export const MAX_MISSED_AFTER = 240;
export const DEFAULT_MISSED_AFTER = 60;
/** A dose can be marked this long after its time (a late "taken" still counts). */
export const MARK_WITHIN_HOURS = 24;

const Instant = z.iso.datetime({ offset: true });
const Id = z.uuid();

/**
 * taken / skipped: someone marked it. due: its time has come, still inside the wait before the
 * family is told. missed: past that wait and not marked. later: its time has not come.
 */
export const DOSE_STATES = ["taken", "skipped", "missed", "due", "later"] as const;
export const DoseState = z.enum(DOSE_STATES);
export type DoseState = z.infer<typeof DoseState>;

export const CareDose = z.object({
  due_at: Instant,
  /** The local time it was set for ("08:00"), in the medicine's time zone. */
  time: TimeOfDay,
  state: DoseState,
  by_name: z.string().nullable().default(null),
  by_me: z.boolean().default(false),
  marked_at: Instant.nullable().default(null),
});
export type CareDose = z.infer<typeof CareDose>;

export const CareWeek = z.object({ taken: z.number().int(), skipped: z.number().int(), missed: z.number().int() });
export type CareWeek = z.infer<typeof CareWeek>;

export const CareMed = z.object({
  id: Id,
  circle_id: z.string().min(1),
  circle_name: z.string().default(""),
  person_name: z.string(),
  person_user_id: z.string().nullable().default(null),
  /** The caller is the one who takes it. */
  for_me: z.boolean().default(false),
  name: z.string(),
  dose: z.string().nullable().default(null),
  times: z.array(TimeOfDay),
  time_zone: z.string(),
  remind_user_ids: z.array(z.string()).default([]),
  missed_after_minutes: z.number().int(),
  note: z.string().nullable().default(null),
  active: z.boolean(),
  can_delete: z.boolean().default(false),
  created_at: Instant,
  /** Today's doses (the medicine's local day), soonest first. */
  today: z.array(CareDose).default([]),
  /** Earlier doses from the last day nobody marked (they wait for an answer). */
  open_missed: z.array(CareDose).default([]),
  /** The last 7 days before today. */
  week: CareWeek.default({ taken: 0, skipped: 0, missed: 0 }),
});
export type CareMed = z.infer<typeof CareMed>;

export const CareResponse = z.object({ meds: z.array(CareMed) });
export type CareResponse = z.infer<typeof CareResponse>;
export const CareMedResponse = z.object({ med: CareMed });
export type CareMedResponse = z.infer<typeof CareMedResponse>;

/** One local day of a medicine's history (GET /care/meds/:id/history). */
export const CareDay = z.object({ date: z.string(), doses: z.array(CareDose) });
export type CareDay = z.infer<typeof CareDay>;
export const CareHistoryResponse = z.object({ days: z.array(CareDay) });
export type CareHistoryResponse = z.infer<typeof CareHistoryResponse>;

const Text = (max: number) => z.string().trim().min(1).max(max);

/** Sorted, without repeats: "20:00, 08:00, 08:00" → ["08:00", "20:00"]. */
export function cleanTimes(times: readonly string[]): string[] {
  return [...new Set(times)].sort();
}

const Times = z
  .array(TimeOfDay)
  .min(1)
  .max(MAX_DOSE_TIMES * 2)
  .transform(cleanTimes)
  .refine((t) => t.length <= MAX_DOSE_TIMES, { message: "too_many_times" });

export const CreateCareMedRequest = z.object({
  /** Made on the phone so a resend never adds the medicine twice. */
  id: Id.optional(),
  circle_id: Id,
  person_name: Text(MED_PERSON_MAX),
  person_user_id: Id.nullable().optional(),
  name: Text(MED_NAME_MAX),
  dose: z.string().trim().max(MED_DOSE_MAX).nullable().optional(),
  times: Times,
  /** Who gets the reminder; empty = the person if they are in the circle, else the one adding it. */
  remind_user_ids: z.array(Id).max(50).optional(),
  missed_after_minutes: z.number().int().min(MIN_MISSED_AFTER).max(MAX_MISSED_AFTER).optional(),
  note: z.string().trim().max(MED_NOTE_MAX).nullable().optional(),
  /** The IANA zone the times are in; the adder's own zone when left out. */
  time_zone: z.string().min(1).max(64).optional(),
});
export type CreateCareMedRequest = z.input<typeof CreateCareMedRequest>;

export const UpdateCareMedRequest = z.object({
  person_name: Text(MED_PERSON_MAX).optional(),
  person_user_id: Id.nullable().optional(),
  name: Text(MED_NAME_MAX).optional(),
  dose: z.string().trim().max(MED_DOSE_MAX).nullable().optional(),
  times: Times.optional(),
  remind_user_ids: z.array(Id).max(50).optional(),
  missed_after_minutes: z.number().int().min(MIN_MISSED_AFTER).max(MAX_MISSED_AFTER).optional(),
  note: z.string().trim().max(MED_NOTE_MAX).nullable().optional(),
  active: z.boolean().optional(),
});
export type UpdateCareMedRequest = z.input<typeof UpdateCareMedRequest>;

/** Mark one dose; "open" takes a mark back. */
export const MarkDoseRequest = z.object({
  due_at: Instant,
  status: z.enum(["taken", "skipped", "open"]),
});
export type MarkDoseRequest = z.infer<typeof MarkDoseRequest>;

/** The doses that wait for someone's answer, oldest first: earlier ones nobody marked, then today's missed. */
export function dosesToAnswer(med: Pick<CareMed, "active" | "today" | "open_missed">): CareDose[] {
  if (!med.active) return [];
  return [...med.open_missed, ...med.today.filter((d) => d.state === "missed")].sort((a, b) => a.due_at.localeCompare(b.due_at));
}

/** The next dose today that is not marked yet (due now first, else the next one later), or null. */
export function nextDose(med: Pick<CareMed, "active" | "today">): CareDose | null {
  if (!med.active) return null;
  return med.today.find((d) => d.state === "due") ?? med.today.find((d) => d.state === "later") ?? null;
}

/** What a dose would look like once marked, for the phone to show at once. */
export function guessDose(med: CareMed, dueAt: string, status: "taken" | "skipped" | "open", now: Date, myName: string | null): CareMed {
  const change = (d: CareDose): CareDose => {
    if (d.due_at !== dueAt) return d;
    if (status === "open") {
      const due = Date.parse(d.due_at);
      const state: DoseState = due > now.getTime() ? "later" : now.getTime() - due > med.missed_after_minutes * 60_000 ? "missed" : "due";
      return { ...d, state, by_name: null, by_me: false, marked_at: null };
    }
    return { ...d, state: status, by_name: myName, by_me: true, marked_at: now.toISOString() };
  };
  const today = med.today.map(change);
  const open_missed = med.open_missed.map(change).filter((d) => d.state === "missed");
  return { ...med, today, open_missed };
}
