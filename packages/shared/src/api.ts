import { z } from "zod";
import { Item, Memory, Message, TimeOfDay, User } from "./entities";
import { CheckinInterval, Language, Tone } from "./enums";
import { CITY_IDS } from "./local";

/** GET /health */
export const HealthResponse = z.object({
  status: z.literal("ok"),
  service: z.literal("fakkarni-api"),
  version: z.string(),
  time: z.iso.datetime({ offset: true }),
  /**
   * The server's process id. In a container, 1 is the first process: the one a deploy's stop
   * signal goes to, so the server hears it and can finish what it is doing.
   */
  pid: z.number().int().positive().optional(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

/**
 * Until Supabase Auth lands (M5), the phone identifies itself with a random install ID
 * generated on first launch and kept in SQLite.
 */
export const INSTALL_ID_HEADER = "x-install-id";

/**
 * On every answer of a server that sends chat replies while they are written (value "1"). The
 * phone asks for a reply that way only from a server that says so: taking the header away
 * (FAKKARNI_CHAT_STREAM=0 on the server) stops the asking on every phone, with no app update.
 */
export const REPLY_STREAM_HEADER = "x-reply-stream";

/** POST /messages — body sent by the phone's sync queue. */
export const PostMessageRequest = z.object({
  client_id: z.string().min(1).max(64),
  text: z.string().trim().min(1).max(4000),
  created_at: z.iso.datetime({ offset: true }),
  /** The user's IANA time zone, so relative dates resolve correctly. */
  timezone: z.string().min(1).max(64).optional(),
  /**
   * "phone": Zaki's model runs on the phone (Android test mode). Without phone_output the
   * server answers 202 with what the phone's model needs (NeedsBrainResponse); the phone then
   * sends the same message again with phone_output, and the server checks and applies it.
   */
  brain: z.enum(["cloud", "phone"]).optional(),
  /** The phone model's answer (PhoneOutput, validated on the server). */
  phone_output: z.unknown().optional(),
  /** Which phone model wrote it, e.g. "qwen3.5-2b-q4" (for the quality event; no content). */
  phone_model: z.string().max(64).optional(),
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
  /** The personal invite link (https://…/r/CODE): the friend and the inviter both get 7 Pro days. */
  url: z.string().optional(),
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
    /** Ring as an alarm (the phone's "alarms" channel). Set from the Saved screen. */
    alarm: z.boolean().optional(),
    /** Fire at a place (its words); null takes the place off. */
    place: z.string().trim().min(1).max(60).nullable().optional(),
    place_on: z.enum(["arrive", "leave"]).optional(),
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

/** DELETE /devices — stop pushes for this account to this phone (sign-out). */
export const UnregisterDeviceRequest = z.object({ push_token: z.string().min(1).max(300) });
export type UnregisterDeviceRequest = z.infer<typeof UnregisterDeviceRequest>;

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
    /** An https://ipn.eg/… link from the InstaPay app, or null to remove it. */
    instapay_link: z.string().trim().max(300).nullable(),
    gender: z.enum(["female", "male"]).nullable(),
    /** A city id (CITY_IDS), or null to forget it. */
    city: z.enum(CITY_IDS).nullable(),
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
  /** Shared side, from this person's point of view. Other people's private data is never included. */
  circles: z.array(z.object({ name: z.string(), kind: z.string(), role: z.string(), joined_at: z.string() })).default([]),
  daftar: z.array(z.object({ other_name: z.string(), direction: z.string(), amount: z.number(), currency: z.string(), note: z.string().nullable(), status: z.string(), created_at: z.string() })).default([]),
  /** Session data (sensitive): present only if the user used Session. */
  sessions: z.array(z.object({ mode: z.string(), mood: z.number(), started_at: z.string(), ended_at: z.string().nullable(), messages: z.array(z.object({ role: z.string(), text: z.string(), created_at: z.string() })) })).default([]),
  checkins: z.array(z.object({ kind: z.string(), note: z.string().nullable(), at: z.string() })).default([]),
  tasks: z.array(z.object({ title: z.string(), role: z.string(), status: z.string(), due_at: z.string().nullable(), created_at: z.string() })).default([]),
  trackers: z.array(z.object({ kind: z.string(), name: z.string().nullable(), goal: z.number().nullable(), entries: z.array(z.object({ amount: z.number(), source: z.string(), at: z.string() })) })).default([]),
  /** Expense / income sections: the user's own, and the shared books they wrote in (their own entries only). */
  /** Comments the user wrote in circle feeds. */
  feed_comments: z.array(z.object({ text: z.string(), at: z.string() })).default([]),
  money: z.array(z.object({ name: z.string(), kind: z.string(), budget: z.number().nullable(), shared: z.boolean(), entries: z.array(z.object({ amount: z.number(), note: z.string().nullable(), at: z.string() })) })).default([]),
  /** Split the bill: bills the user split, with each person's name and share. */
  splits: z.array(z.object({ title: z.string(), total: z.number(), currency: z.string(), people: z.array(z.object({ name: z.string(), share: z.number(), paid: z.boolean() })), created_at: z.string() })).default([]),
  /** Homework pages the user handed in as photos (base64), kept 90 days. */
  photos: z.array(z.object({ task: z.string().nullable(), mime: z.string(), data: z.string(), created_at: z.string() })).default([]),
  /** Pocket-money records the user is part of, as child or parent (homework rewards and what was handed over). */
  pocket_money: z.array(z.object({ role: z.enum(["child", "parent"]), kind: z.string(), amount: z.number(), title: z.string().nullable(), at: z.string() })).default([]),
  /** Household list things the user added or ticked off, with their list's name. */
  list_items: z.array(z.object({ list: z.string(), title: z.string(), qty: z.string().nullable(), added: z.boolean(), done_at: z.string().nullable(), created_at: z.string() })).default([]),
  link_tasks: z
    .array(z.object({ other_name: z.string(), title: z.string(), note: z.string().nullable(), status: z.string(), due_at: z.string().nullable(), done_at: z.string().nullable(), created_at: z.string() }))
    .default([]),
  gameyas: z
    .array(
      z.object({
        name: z.string(),
        role: z.enum(["organizer", "member"]),
        amount: z.number(),
        currency: z.string(),
        pay_day: z.number(),
        start_month: z.string(),
        members: z.array(z.object({ name: z.string(), turn: z.number(), is_me: z.boolean(), received: z.boolean(), paid_rounds: z.array(z.number()) })),
        created_at: z.string(),
      }),
    )
    .default([]),
  care_meds: z
    .array(z.object({ person: z.string(), for_me: z.boolean(), added: z.boolean(), name: z.string(), dose: z.string().nullable(), times: z.array(z.string()), time_zone: z.string(), note: z.string().nullable(), active: z.boolean(), created_at: z.string() }))
    .default([]),
  care_marks: z.array(z.object({ medicine: z.string(), person: z.string(), due_at: z.string(), status: z.string().nullable(), marked_at: z.string().nullable() })).default([]),
});
export type ExportResponse = z.infer<typeof ExportResponse>;
