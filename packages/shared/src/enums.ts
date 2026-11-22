import { z } from "zod";

/** UI + friend language. Egyptian Arabic is the default (PRD §7, CLAUDE.md). */
export const Language = z.enum(["ar-EG", "en"]);
export type Language = z.infer<typeof Language>;
export const DEFAULT_LANGUAGE: Language = "ar-EG";

/** Friend's tone setting (F10): more playful or more calm. */
export const Tone = z.enum(["playful", "balanced", "calm"]);
export type Tone = z.infer<typeof Tone>;

/** Daytime check-in frequency (F7). "off" disables check-ins. */
export const CheckinInterval = z.enum(["2", "4", "off"]);
export type CheckinInterval = z.infer<typeof CheckinInterval>;

/** Subscription state mirrored from RevenueCat (FR-9). */
export const Plan = z.enum(["none", "trial", "monthly", "yearly", "expired"]);
export type Plan = z.infer<typeof Plan>;

/** Which paid plan: Pro (one person) or Family (Pro for up to 6 people, one payer). */
export const PlanTier = z.enum(["pro", "family"]);
export type PlanTier = z.infer<typeof PlanTier>;

export const Platform = z.enum(["ios", "android"]);
export type Platform = z.infer<typeof Platform>;

export const MessageRole = z.enum(["user", "friend"]);
export type MessageRole = z.infer<typeof MessageRole>;

export const MessageKind = z.enum([
  "chat",
  "morning",
  "night",
  "reminder",
  "checkin",
  "followup",
  /** Zaki's note that today's free AI messages are used up, with a Pro button. */
  "upsell",
  /** Zaki telling the user something happened with their people (a debt confirmed…). */
  "update",
]);
export type MessageKind = z.infer<typeof MessageKind>;

export const ItemType = z.enum(["task", "reminder", "note", "list_item", "debt"]);
export type ItemType = z.infer<typeof ItemType>;

export const ItemStatus = z.enum(["open", "done", "cancelled"]);
export type ItemStatus = z.infer<typeof ItemStatus>;

/** owed_to_me: someone owes the user. i_owe: the user owes someone. */
export const DebtDirection = z.enum(["owed_to_me", "i_owe"]);
export type DebtDirection = z.infer<typeof DebtDirection>;

export const MemoryKind = z.enum(["person", "place", "preference", "fact"]);
export type MemoryKind = z.infer<typeof MemoryKind>;

/** RevenueCat entitlement that unlocks paid features (CLAUDE.md). */
export const PRO_ENTITLEMENT = "pro";
