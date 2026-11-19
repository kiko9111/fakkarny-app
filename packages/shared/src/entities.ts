import { z } from "zod";
import {
  CheckinInterval,
  DebtDirection,
  ItemStatus,
  ItemType,
  Language,
  MemoryKind,
  MessageKind,
  MessageRole,
  Plan,
  Platform,
  Tone,
} from "./enums";

/**
 * Wire shapes of the PRD §6 data model, as sent between app and API.
 * All instants are ISO-8601 UTC strings; convert with the user's IANA timezone
 * only at the edges (CLAUDE.md: "Store times in UTC").
 */

const Id = z.string().min(1);
const Instant = z.iso.datetime({ offset: true });
/** Wall-clock time of day, "HH:MM" 24h. */
export const TimeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM");

export const User = z.object({
  id: Id,
  name: z.string().nullable(),
  language: Language,
  timezone: z.string().min(1),
  wake_time: TimeOfDay,
  sleep_time: TimeOfDay,
  tone: Tone,
  checkin_interval_h: CheckinInterval,
  ignored_checkins: z.number().int().nonnegative(),
  plan: Plan,
  plan_expires_at: Instant.nullable(),
  created_at: Instant,
  last_active_at: Instant.nullable(),
});
export type User = z.infer<typeof User>;

export const Device = z.object({
  id: Id,
  user_id: Id,
  platform: Platform,
  push_token: z.string().nullable(),
  last_seen_at: Instant.nullable(),
});
export type Device = z.infer<typeof Device>;

export const Message = z.object({
  id: Id,
  user_id: Id,
  role: MessageRole,
  text: z.string(),
  /** Generated on the phone; makes sync idempotent. */
  client_id: z.string().min(1),
  kind: MessageKind,
  created_at: Instant,
});
export type Message = z.infer<typeof Message>;

export const Item = z.object({
  id: Id,
  user_id: Id,
  type: ItemType,
  title: z.string().min(1),
  due_at: Instant.nullable(),
  status: ItemStatus,
  debt_person: z.string().nullable(),
  debt_amount: z.number().nullable(),
  debt_direction: DebtDirection.nullable(),
  follow_up_at: Instant.nullable(),
  source_message_id: Id.nullable(),
  updated_at: Instant,
  created_at: Instant,
  done_at: Instant.nullable(),
});
export type Item = z.infer<typeof Item>;

export const Memory = z.object({
  id: Id,
  user_id: Id,
  kind: MemoryKind,
  subject: z.string().min(1),
  content: z.string().min(1),
  last_used_at: Instant.nullable(),
  created_at: Instant,
});
export type Memory = z.infer<typeof Memory>;
