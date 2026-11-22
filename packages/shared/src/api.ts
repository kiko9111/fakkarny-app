import { z } from "zod";
import { Item, Memory, Message, TimeOfDay, User } from "./entities";
import { CheckinInterval, Language, Tone } from "./enums";

/** GET /health */
export const HealthResponse = z.object({
  status: z.literal("ok"),
  service: z.literal("fakkarni-api"),
  version: z.string(),
  time: z.iso.datetime({ offset: true }),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

/**
 * Until Supabase Auth lands (M5), the phone identifies itself with a random install ID
 * generated on first launch and kept in SQLite.
 */
export const INSTALL_ID_HEADER = "x-install-id";

/** POST /messages — body sent by the phone's sync queue. */
export const PostMessageRequest = z.object({
  client_id: z.string().min(1).max(64),
  text: z.string().trim().min(1).max(4000),
  created_at: z.iso.datetime({ offset: true }),
  /** The user's IANA time zone, so relative dates resolve correctly. */
  timezone: z.string().min(1).max(64).optional(),
});
export type PostMessageRequest = z.infer<typeof PostMessageRequest>;

export const AiAllowance = z.object({ limit: z.number().int().nullable(), used: z.number().int().nonnegative() });
export type AiAllowance = z.infer<typeof AiAllowance>;

export const PostMessageResponse = z.object({
  message: Message,
  /** Friend replies (1–3), already stored server-side. Empty if the AI is unavailable. */
  replies: z.array(Message),
  /** Items created or updated from this message: drives the "Saved" chip and local reminders. */
  items: z.array(Item),
  /** Memories saved from this message. */
  memories: z.array(Memory),
  /** True when this client_id was already processed (safe retry). */
  duplicate: z.boolean(),
  /** Today's AI allowance after this message (limit null = unlimited). Absent on retries. */
  ai_allowance: AiAllowance.optional(),
});
export type PostMessageResponse = z.infer<typeof PostMessageResponse>;

/** GET /billing/offers — what the paywall may show right now. */
export const BillingOffersResponse = z.object({ founders_left: z.number().int().nonnegative() });
export type BillingOffersResponse = z.infer<typeof BillingOffersResponse>;

/** GET /me/referral — the user's invite code and the Pro days it has earned. */
export const ReferralResponse = z.object({
  code: z.string(),
  /** Pro days earned this calendar month (7 per friend, at most 28). */
  days_this_month: z.number().int().nonnegative(),
  max_days_per_month: z.number().int().positive(),
});
export type ReferralResponse = z.infer<typeof ReferralResponse>;

/** POST /referrals/claim — a new user says who invited them (once, in their first week). */
export const ClaimReferralRequest = z.object({ code: z.string().trim().min(4).max(16) });
export type ClaimReferralRequest = z.infer<typeof ClaimReferralRequest>;

/** GET /messages?after=<iso>&limit=<n> — pull messages (e.g. proactive ones) the phone hasn't seen. */
export const ListMessagesQuery = z.object({
  after: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export const ListMessagesResponse = z.object({ messages: z.array(Message) });
export type ListMessagesResponse = z.infer<typeof ListMessagesResponse>;

/** PATCH /items/:id — user fixes what the friend saved (the "Saved" chip). Times are ISO instants. */
export const PatchItemRequest = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    status: z.enum(["open", "done", "cancelled"]).optional(),
    due_at: z.iso.datetime({ offset: true }).nullable().optional(),
    remind_at: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");
export type PatchItemRequest = z.infer<typeof PatchItemRequest>;
export const ItemResponse = z.object({ item: Item });
export type ItemResponse = z.infer<typeof ItemResponse>;

/** GET /items?status=open — Upcoming and Money tabs. */
export const ListItemsResponse = z.object({ items: z.array(Item) });
export type ListItemsResponse = z.infer<typeof ListItemsResponse>;

/** GET /memories — "what it remembers" in settings (FR-4: view and delete any memory). */
export const ListMemoriesResponse = z.object({ memories: z.array(Memory) });
export type ListMemoriesResponse = z.infer<typeof ListMemoriesResponse>;

/** POST /devices — register this phone's Expo push token (briefs and check-ins arrive as push). */
export const RegisterDeviceRequest = z.object({
  platform: z.enum(["ios", "android"]),
  push_token: z.string().min(1).max(300).nullable(),
});
export type RegisterDeviceRequest = z.infer<typeof RegisterDeviceRequest>;

/** GET/PATCH /me */
export const MeResponse = z.object({ user: User });
export type MeResponse = z.infer<typeof MeResponse>;

export const PatchMeRequest = z
  .object({
    name: z.string().trim().min(1).max(60).nullable(),
    language: Language,
    timezone: z.string().min(1).max(64),
    wake_time: TimeOfDay,
    sleep_time: TimeOfDay,
    tone: Tone,
    checkin_interval_h: CheckinInterval,
    always_direct: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");
export type PatchMeRequest = z.infer<typeof PatchMeRequest>;

/** GET /me/export */
export const ExportResponse = z.object({
  exported_at: z.string(),
  user: User,
  messages: z.array(Message),
  items: z.array(Item),
  memories: z.array(Memory),
  summaries: z.array(z.object({ period_start: z.string(), period_end: z.string(), text: z.string() })),
});
export type ExportResponse = z.infer<typeof ExportResponse>;
