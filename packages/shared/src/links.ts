import { z } from "zod";

/**
 * No-app links (2026-11-27, kareem: "no app web pages"): someone who is not on Zaki opens a
 * WhatsApp link in any browser and answers there. Debts (/d/), splits (/s/) and invites (/i/)
 * came first; this file holds the shapes for tasks (/t/) and household lists (/l/), and the pure
 * rules every link page follows. Wire shapes, snake_case.
 */
const Instant = z.iso.datetime({ offset: true });

export const LINK_NAME_MAX = 40;
export const LINK_TITLE_MAX = 120;
export const LINK_NOTE_MAX = 500;
/** Open link tasks one person may have at once (an abuse guard, not a product cap). */
export const MAX_OPEN_LINK_TASKS = 100;

export const LINK_TASK_STATUSES = ["pending", "accepted", "declined", "done", "cancelled"] as const;
export const LinkTaskStatus = z.enum(LINK_TASK_STATUSES);
export type LinkTaskStatus = z.infer<typeof LinkTaskStatus>;

/** What the person holding the link may tap on a task, by its status. */
export type LinkTaskAnswer = "accept" | "decline" | "done";

export function linkTaskNext(status: LinkTaskStatus, answer: LinkTaskAnswer): LinkTaskStatus | null {
  if (status === "pending") return answer === "accept" ? "accepted" : answer === "decline" ? "declined" : "done";
  // Changed their mind after "not now": they can still take it on or just do it.
  if (status === "declined") return answer === "accept" ? "accepted" : answer === "done" ? "done" : null;
  if (status === "accepted") return answer === "done" ? "done" : null;
  return null;
}

/** The creator can send the link again while the other person may still answer. */
export const linkTaskShareable = (s: LinkTaskStatus) => s === "pending" || s === "accepted";
export const linkTaskCancellable = (s: LinkTaskStatus) => s === "pending" || s === "accepted" || s === "declined";

export const LinkTask = z.object({
  id: z.uuid(),
  code: z.string(),
  url: z.string(),
  circle_id: z.string().nullable().default(null),
  other_name: z.string(),
  title: z.string(),
  note: z.string().nullable().default(null),
  due_at: Instant.nullable().default(null),
  status: LinkTaskStatus.catch("pending"),
  responded_at: Instant.nullable().default(null),
  done_at: Instant.nullable().default(null),
  /** How many times the page was opened (the creator sees "seen"). */
  seen: z.boolean().default(false),
  created_at: Instant,
});
export type LinkTask = z.infer<typeof LinkTask>;

export const CreateLinkTaskRequest = z.object({
  /** Made on the phone, so a resend is harmless. */
  id: z.uuid().optional(),
  circle_id: z.uuid().nullable().optional(),
  other_name: z.string().trim().min(1).max(LINK_NAME_MAX),
  title: z.string().trim().min(1).max(LINK_TITLE_MAX),
  note: z.string().trim().max(LINK_NOTE_MAX).nullable().optional(),
  due_at: Instant.nullable().optional(),
});
export type CreateLinkTaskRequest = z.infer<typeof CreateLinkTaskRequest>;

export const LinkTaskResponse = z.object({ task: LinkTask, share_text: z.string().nullable() });
export type LinkTaskResponse = z.infer<typeof LinkTaskResponse>;

/** POST /lists/:id/link: the list's no-app link and the WhatsApp text to send it with. */
export const ListLinkResponse = z.object({ url: z.string(), share_text: z.string() });
export type ListLinkResponse = z.infer<typeof ListLinkResponse>;

/** A name typed on a web page: trimmed, one line, short. Empty = none. */
export function cleanWebName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, LINK_NAME_MAX);
  return s || null;
}
