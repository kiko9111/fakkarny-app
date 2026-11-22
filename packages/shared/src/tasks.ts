import { z } from "zod";

/**
 * Assigned tasks (Zaki M5): one circle member asks another to do something. Accept first:
 * nothing lands in the other person's list until they say yes. Wire shapes, snake_case.
 */
const Instant = z.iso.datetime({ offset: true });

export const TaskStatus = z.enum(["pending", "accepted", "declined", "done", "cancelled"]);
export type TaskStatus = z.infer<typeof TaskStatus>;

/** The caller's side of a task: they asked for it, it was asked of them, or they only watch it in the circle. */
export const TaskRole = z.enum(["assigner", "assignee", "watcher"]);
export type TaskRole = z.infer<typeof TaskRole>;

export const CircleTask = z.object({
  id: z.string(),
  circle_id: z.string(),
  circle_name: z.string(),
  title: z.string(),
  due_at: Instant.nullable(),
  /** When Zaki reminds the assignee (null = at due_at). The assigner sets it; the assignee may change it. */
  remind_at: Instant.nullable().default(null),
  /** Homework: a parent's description or link, opened by the child, who then taps done. */
  homework: z.boolean().default(false),
  note: z.string().nullable().default(null),
  status: TaskStatus,
  role: TaskRole,
  assigner_name: z.string().nullable(),
  assignee_name: z.string().nullable(),
  /** True when the assigner may ask Zaki to nudge right now. */
  can_nudge: z.boolean(),
  created_at: Instant,
  responded_at: Instant.nullable(),
  done_at: Instant.nullable(),
});
export type CircleTask = z.infer<typeof CircleTask>;

export const CreateTaskRequest = z.object({
  assignee_id: z.uuid(),
  title: z.string().trim().min(1).max(120),
  due_at: Instant.nullable().optional(),
  remind_at: Instant.nullable().optional(),
  homework: z.boolean().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});
export type CreateTaskRequest = z.infer<typeof CreateTaskRequest>;

/** Change when Zaki reminds the assignee: the assigner while it is pending, the assignee any time it is open. */
export const TaskRemindRequest = z.object({ remind_at: Instant.nullable() });
export type TaskRemindRequest = z.infer<typeof TaskRemindRequest>;

export const RespondTaskRequest = z.object({ answer: z.enum(["accept", "decline"]) });
export type RespondTaskRequest = z.infer<typeof RespondTaskRequest>;

export const TaskResponse = z.object({ task: CircleTask });
export type TaskResponse = z.infer<typeof TaskResponse>;
export const ListTasksResponse = z.object({ tasks: z.array(CircleTask) });
export type ListTasksResponse = z.infer<typeof ListTasksResponse>;

/** Reactions a member can leave on a feed item (one each; tap again to take it back). */
export const REACTION_KEYS = ["heart", "clap", "laugh", "pray", "strong"] as const;
export const ReactionKey = z.enum(REACTION_KEYS);
export type ReactionKey = z.infer<typeof ReactionKey>;

export const PostComment = z.object({
  id: z.string(),
  author_name: z.string().nullable(),
  is_mine: z.boolean(),
  /** Zaki answering an @Zaki ask (template words, in the reader's language). */
  is_zaki: z.boolean(),
  text: z.string(),
  created_at: Instant,
});
export type PostComment = z.infer<typeof PostComment>;

/** Longest comment: a short line, so the feed never turns into a group chat. */
export const MAX_COMMENT = 200;

/** One line Zaki posted in a circle, already written in the reader's language. */
export const CirclePost = z.object({
  id: z.string(),
  text: z.string(),
  created_at: Instant,
  /** "iftar" = an invitation the reader can answer. */
  kind: z.enum(["iftar"]).nullable().default(null),
  /** The reader's own answer to that invitation, if any. */
  my_rsvp: z.boolean().nullable().default(null),
  /** Reaction counts (only keys someone used) and the reader's own. */
  reactions: z.array(z.object({ key: z.string(), count: z.number().int().positive() })).default([]),
  my_reaction: z.string().nullable().default(null),
  /** The latest comments, oldest first, and how many there are in all. */
  comments: z.array(PostComment).default([]),
  comment_count: z.number().int().nonnegative().default(0),
});
export type CirclePost = z.infer<typeof CirclePost>;
export const ReactRequest = z.object({ key: ReactionKey.nullable() });
export type ReactRequest = z.infer<typeof ReactRequest>;
export const CommentRequest = z.object({ text: z.string().trim().min(1).max(MAX_COMMENT) });
export type CommentRequest = z.infer<typeof CommentRequest>;
export const PostResponse = z.object({ post: CirclePost });
export type PostResponse = z.infer<typeof PostResponse>;

export const CircleFeedResponse = z.object({ posts: z.array(CirclePost), tasks: z.array(CircleTask) });
export type CircleFeedResponse = z.infer<typeof CircleFeedResponse>;

/** An iftar invitation to the whole circle (Ramadan pack). `on` is a calendar day. */
export const IftarRequest = z.object({ on: z.iso.date(), note: z.string().trim().max(80).optional() });
export type IftarRequest = z.infer<typeof IftarRequest>;
export const RsvpRequest = z.object({ going: z.boolean() });
