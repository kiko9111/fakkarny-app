import { z } from "zod";

/**
 * Session (Zaki M8): a private space to reflect on how you feel. Not therapy, adults only,
 * separate consent, stored apart from everything else. Wire shapes, snake_case.
 */
const Instant = z.iso.datetime({ offset: true });

export const SessionMode = z.enum(["talk", "vent", "night", "big_day"]);
export type SessionMode = z.infer<typeof SessionMode>;

/** The five faces: 1 = very low … 5 = great. */
export const Mood = z.number().int().min(1).max(5);

/** Free plan: this many sessions in any 7 days. Pro: no limit. */
export const FREE_SESSIONS_PER_WEEK = 1;
/** A session is short on purpose (5 to 10 minutes): Zaki closes it kindly after this many user messages. */
export const SESSION_MAX_USER_MESSAGES = 30;
/** The consent text version the user agreed to; bump when the wording changes. */
export const SESSION_CONSENT_VERSION = "2026-11-22";

export const SessionStep = z.object({ title: z.string(), remind_at: Instant.nullable(), accepted: z.boolean() });
export const SessionMessage = z.object({
  id: z.string(),
  role: z.enum(["user", "zaki"]),
  text: z.string(),
  created_at: Instant,
  /** One small step Zaki suggested; the user may turn it into a reminder with one tap. */
  step: SessionStep.nullable(),
});
export type SessionMessage = z.infer<typeof SessionMessage>;

export const Session = z.object({
  id: z.string(),
  mode: SessionMode,
  mood: Mood,
  started_at: Instant,
  ended_at: Instant.nullable(),
  messages: z.array(SessionMessage),
});
export type Session = z.infer<typeof Session>;

export const SessionState = z.object({
  /** False while Session is switched off on the server (SESSION_ENABLED): the app shows "coming soon". */
  available: z.boolean(),
  /** False for anyone marked as a teen in a family circle: Session is 18+. */
  allowed: z.boolean(),
  consented: z.boolean(),
  /** Sessions the user may still start this week; null = no limit (Pro). */
  free_left: z.number().int().nullable(),
  next_free_at: Instant.nullable(),
  open: Session.nullable(),
  /** Recent moods, oldest first, for the mood strip. */
  moods: z.array(z.object({ at: Instant, mood: Mood })),
  /** Always shown on the Session screen. */
  helpline: z.string(),
});
export type SessionState = z.infer<typeof SessionState>;

export const SessionConsentRequest = z.object({ adult: z.literal(true), agree: z.literal(true) });
export const StartSessionRequest = z.object({ mode: SessionMode, mood: Mood });
export type StartSessionRequest = z.infer<typeof StartSessionRequest>;
export const SessionMessageRequest = z.object({ text: z.string().trim().min(1).max(2000) });

export const SessionResponse = z.object({ session: Session });
export type SessionResponse = z.infer<typeof SessionResponse>;
