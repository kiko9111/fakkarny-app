import { z } from "zod";

/**
 * Trackers (Zaki M6): one thing the user cares about, filled from chat, from one tap, and
 * from circle activity. Free users keep 1 tracker; Pro has no limit. Wire shapes, snake_case.
 */
const Instant = z.iso.datetime({ offset: true });

export const TrackerKind = z.enum(["water", "prayer", "gym", "quran", "medicine", "study", "spending", "savings", "fasting", "charity", "custom"]);
export type TrackerKind = z.infer<typeof TrackerKind>;
export const TrackerUnit = z.enum(["count", "money"]);
export type TrackerUnit = z.infer<typeof TrackerUnit>;

/**
 * What each template counts. `goal` is per day, except for savings where it is the whole
 * target (and the user sets it). `step` is what one tap adds.
 */
export const TRACKER_TEMPLATES: Record<TrackerKind, { unit: TrackerUnit; goal: number | null; step: number; cumulative: boolean }> = {
  water: { unit: "count", goal: 8, step: 1, cumulative: false },
  prayer: { unit: "count", goal: 5, step: 1, cumulative: false },
  gym: { unit: "count", goal: 1, step: 1, cumulative: false },
  quran: { unit: "count", goal: 1, step: 1, cumulative: false },
  medicine: { unit: "count", goal: 1, step: 1, cumulative: false },
  study: { unit: "count", goal: 1, step: 1, cumulative: false },
  spending: { unit: "money", goal: null, step: 0, cumulative: false },
  savings: { unit: "money", goal: null, step: 0, cumulative: true },
  fasting: { unit: "count", goal: 1, step: 1, cumulative: false },
  charity: { unit: "money", goal: null, step: 0, cumulative: true },
  custom: { unit: "count", goal: 1, step: 1, cumulative: false },
};

/**
 * Ramadan pack: these four trackers are a gift during the season and never count against
 * the free limit. The window opens two weeks early and is generous at both ends, because
 * the month starts on the moon sighting. Add next year's window before it comes.
 */
export const RAMADAN_PACK: TrackerKind[] = ["fasting", "prayer", "quran", "charity"];
export const RAMADAN_SEASONS: { from: string; to: string }[] = [{ from: "2027-01-25", to: "2027-03-12" }];
export function isRamadanSeason(now: Date): boolean {
  const day = now.toISOString().slice(0, 10);
  return RAMADAN_SEASONS.some((s) => day >= s.from && day <= s.to);
}

/** Trackers a free user may keep. Pro: no limit. */
export const FREE_TRACKERS = 1;

export const Tracker = z.object({
  id: z.string(),
  kind: TrackerKind,
  /** Only for "custom" (the user's own words); templates are named by the app in the user's language. */
  name: z.string().nullable(),
  unit: TrackerUnit,
  goal: z.number().positive().nullable(),
  /** True when the goal is a whole target (savings), false when it is per day. */
  cumulative: z.boolean(),
  today: z.number(),
  /** The last 7 local days, oldest first; the last one is today. */
  week: z.array(z.number()).length(7),
  total: z.number(),
  /** Days in a row (ending today or yesterday) that met the daily goal. 0 for money trackers. */
  streak: z.number().int().nonnegative(),
  /** Set for trackers that came with a seasonal pack (they do not count against the free limit). */
  pack: z.enum(["ramadan"]).nullable().default(null),
  /** The last 30 local days, oldest first (for the graph). */
  month: z.array(z.number()).default([]),
  /** Local "HH:MM" times the user picked for Zaki to ask "did you … today?". */
  ask_times: z.array(z.string()).default([]),
  /** The user's own word for one step ("pages", "km"), builder trackers only. */
  unit_label: z.string().nullable().default(null),
  /** Shared with this circle: its members see the tracker's progress. */
  circle_id: z.string().nullable().default(null),
  circle_name: z.string().nullable().default(null),
  created_at: Instant,
});
export type Tracker = z.infer<typeof Tracker>;

/** "07:30": a local time of day for tracker questions. */
export const AskTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const MAX_ASK_TIMES = 3;

export const CreateTrackerRequest = z.object({
  kind: TrackerKind,
  name: z.string().trim().min(1).max(40).optional(),
  goal: z.number().positive().max(100_000_000).optional(),
  ask_times: z.array(AskTime).max(MAX_ASK_TIMES).optional(),
  unit_label: z.string().trim().min(1).max(20).optional(),
  circle_id: z.uuid().nullable().optional(),
});
export type CreateTrackerRequest = z.infer<typeof CreateTrackerRequest>;

/** Change a tracker after the builder: ask times, sharing, goal. */
export const UpdateTrackerRequest = z.object({
  goal: z.number().positive().max(100_000_000).nullable().optional(),
  ask_times: z.array(AskTime).max(MAX_ASK_TIMES).optional(),
  circle_id: z.uuid().nullable().optional(),
});
export type UpdateTrackerRequest = z.infer<typeof UpdateTrackerRequest>;

/** A circle member's shared tracker, as the circle sees it (no money trackers, ever). */
export const SharedTracker = z.object({
  id: z.string(),
  owner_name: z.string().nullable(),
  is_mine: z.boolean(),
  kind: TrackerKind,
  name: z.string().nullable(),
  unit_label: z.string().nullable(),
  goal: z.number().nullable(),
  today: z.number(),
  streak: z.number().int().nonnegative(),
  week: z.array(z.number()).length(7),
});
export type SharedTracker = z.infer<typeof SharedTracker>;
export const SharedTrackersResponse = z.object({ trackers: z.array(SharedTracker) });
export type SharedTrackersResponse = z.infer<typeof SharedTrackersResponse>;

export const LogTrackerRequest = z.object({
  amount: z.number().positive().max(100_000_000).optional(),
  /** When it was logged on the phone, if it waited offline (up to 3 days back; else the server's now). */
  at: z.iso.datetime({ offset: true }).optional(),
});
export type LogTrackerRequest = z.infer<typeof LogTrackerRequest>;

export const TrackerResponse = z.object({ tracker: Tracker });
export type TrackerResponse = z.infer<typeof TrackerResponse>;
export const ListTrackersResponse = z.object({
  trackers: z.array(Tracker),
  /** How many trackers this user may keep; null = no limit (Pro). */
  limit: z.number().int().nullable(),
  /** "available" during the season until the user adds it; "off" outside the season. */
  ramadan_pack: z.enum(["available", "added", "off"]).default("off"),
});
export type ListTrackersResponse = z.infer<typeof ListTrackersResponse>;
