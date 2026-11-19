import { z } from "zod";
import { DebtDirection, ItemStatus, ItemType, MemoryKind } from "./enums";

/**
 * The structured output of one Claude call (PRD §6 "Response tool schema").
 * Every AI output is validated with this before anything is applied.
 *
 * Times from the model are *local* wall-clock ("2026-11-22T18:00"), resolved in
 * the user's timezone by the API before storage as UTC.
 */
export const LocalDateTime = z.iso.datetime({ local: true });

export const DebtDetails = z.object({
  person: z.string().min(1),
  amount: z.number().positive(),
  direction: DebtDirection,
});

export const CreateItemAction = z.object({
  type: ItemType,
  title: z.string().min(1),
  due_at_local: LocalDateTime.optional(),
  remind_at_local: LocalDateTime.optional(),
  follow_up_at_local: LocalDateTime.optional(),
  /** Medicine, flights, payments with penalties: get the clear version at due time (F5). */
  important: z.boolean().optional(),
  /** Indirect friend question for the reminder notification, e.g. "Heading out soon? Traffic to Dokki is crazy 😅". */
  nudge: z.string().min(1).max(200).optional(),
  debt: DebtDetails.optional(),
});
export type CreateItemAction = z.infer<typeof CreateItemAction>;

export const UpdateItemAction = z.object({
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  status: ItemStatus.optional(),
  due_at_local: LocalDateTime.optional(),
  remind_at_local: LocalDateTime.optional(),
  follow_up_at_local: LocalDateTime.optional(),
});
export type UpdateItemAction = z.infer<typeof UpdateItemAction>;

export const SaveMemoryAction = z.object({
  kind: MemoryKind,
  subject: z.string().min(1),
  content: z.string().min(1),
});
export type SaveMemoryAction = z.infer<typeof SaveMemoryAction>;

export const FriendResponse = z.object({
  /** 1–3 short messages, in the persona. */
  reply: z.array(z.string().min(1)).min(1).max(3),
  create_items: z.array(CreateItemAction).default([]),
  update_items: z.array(UpdateItemAction).default([]),
  save_memories: z.array(SaveMemoryAction).default([]),
  crisis: z.boolean().default(false),
});
export type FriendResponse = z.infer<typeof FriendResponse>;
