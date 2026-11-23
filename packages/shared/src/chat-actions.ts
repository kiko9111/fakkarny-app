import { z } from "zod";
import { AskTime, MAX_ASK_TIMES, TrackerKind } from "./trackers";
import { MoneyKind } from "./money";

/**
 * Things Zaki can do in the app from the chat, beyond reminders and memories (owner goal,
 * 2026-11-23: "Zaki can do everything in the app from the chat"). The model names things (a
 * section, tracker, circle or person) or copies an id from the context (`ref`: a task, Daftar
 * entry or split), and the server resolves them. Anything that reaches other people waits for
 * the user's OK (a pending card); the user's own changes happen at once and can be undone.
 */
export const APP_ACTION_KINDS = [
  // Money (sections, entries, budgets)
  "log_money",
  "create_section",
  "set_budget",
  "delete_money_entry",
  "delete_section",
  // Daftar: debts with a person, both sides see them
  "daftar_add",
  "daftar_settle",
  "daftar_cancel",
  "daftar_answer",
  "daftar_remind",
  // Trackers
  "create_tracker",
  "log_tracker",
  "update_tracker",
  "undo_tracker",
  "delete_tracker",
  "ramadan_pack",
  // Circles
  "create_circle",
  "invite",
  "join_circle",
  "rename_circle",
  "leave_circle",
  "checkin",
  "ask_checkin",
  "ask_circle",
  "iftar",
  // Tasks and homework
  "assign_task",
  "task_answer",
  "task_nudge",
  "task_cancel",
  "task_remind",
  "homework_submit",
  "homework_review",
  // Bill split
  "split_bill",
  "split_paid",
  // Memories, settings, places in the app
  "forget",
  "settings",
  "open_screen",
] as const;
export const AppActionKind = z.enum(APP_ACTION_KINDS);
export type AppActionKind = z.infer<typeof AppActionKind>;

/**
 * Kinds that reach other people, or delete something with other people's data in it: they always
 * wait for the user's OK. (daftar_add and log_money wait too when they reach a circle member or
 * a shared book; delete_section when it is a shared book.)
 */
export const CONFIRM_KINDS: readonly AppActionKind[] = [
  "assign_task",
  "ask_circle",
  "daftar_settle",
  "daftar_cancel",
  "daftar_answer",
  "task_answer",
  "task_nudge",
  "task_cancel",
  "homework_submit",
  "homework_review",
  "checkin",
  "ask_checkin",
  "leave_circle",
  "iftar",
  "delete_section",
  "delete_tracker",
];

/** What `settings` can change from the chat (server-side settings only; language and theme live on the phone). */
export const CHAT_SETTINGS = ["name", "wake_time", "sleep_time", "instapay", "address", "tone", "checkins"] as const;
export const ChatSetting = z.enum(CHAT_SETTINGS);
export type ChatSetting = z.infer<typeof ChatSetting>;

/** Places `open_screen` can open. */
export const CHAT_SCREENS = ["memories", "settings", "money", "daftar", "trackers", "circles", "today", "receipt", "invite_friend", "paywall", "split", "session"] as const;
export const ChatScreen = z.enum(CHAT_SCREENS);
export type ChatScreen = z.infer<typeof ChatScreen>;

const Name = z.string().trim().min(1).max(60);
const LocalDateTime = z.iso.datetime({ local: true });

/**
 * One app action from the model, validated. Which fields matter depends on `kind`:
 * - log_money: amount, money_kind, note?, section? (a section or shared book name)
 * - create_section: name, money_kind, amount? (monthly budget), circle? (makes it a shared book)
 * - set_budget: section, amount (null clears it)
 * - delete_money_entry: section?, amount?, note? (the latest matching entry of theirs)
 * - delete_section: section
 * - daftar_add: person, amount, direction, note?
 * - daftar_settle / daftar_cancel / daftar_remind: ref (a Daftar id) or person
 * - daftar_answer: ref or person, answer ("yes" = it's right, "no" = not right)
 * - create_tracker: name, tracker_kind?, amount? (daily goal), unit?, ask_times?, circle? (share it)
 * - log_tracker: tracker, amount? · undo_tracker / delete_tracker: tracker
 * - update_tracker: tracker, amount? (goal), ask_times?
 * - ramadan_pack: nothing
 * - create_circle: name, family? · invite / leave_circle: circle · rename_circle: circle, name
 * - join_circle: text (the invite code)
 * - checkin: circle?, checkin_kind, note? · ask_checkin: person, circle?
 * - ask_circle: circle?, text (what to ask, e.g. "remind everyone about Friday lunch")
 * - iftar: circle?, due_at_local (the day), note?
 * - assign_task: person, title, circle?, due_at_local?, remind_at_local?, homework?, note?
 * - task_answer: ref, answer · task_nudge / task_cancel: ref · task_remind: ref, remind_at_local
 * - homework_submit: ref, text · homework_review: ref, answer ("yes" well done, "no" redo), note?
 * - split_bill: amount (the total), people (names, without the user), name? (title)
 * - split_paid: ref?, person
 * - forget: text (what to forget)
 * - settings: setting, text (the value)
 * - open_screen: screen
 */
export const AppAction = z.object({
  kind: AppActionKind,
  name: Name.optional(),
  title: Name.optional(),
  section: Name.optional(),
  tracker: Name.optional(),
  circle: Name.optional(),
  person: Name.optional(),
  amount: z.number().positive().max(100_000_000).nullable().optional(),
  money_kind: MoneyKind.optional(),
  tracker_kind: TrackerKind.optional(),
  unit: z.string().trim().min(1).max(20).optional(),
  ask_times: z.array(AskTime).max(MAX_ASK_TIMES).optional(),
  family: z.boolean().optional(),
  homework: z.boolean().optional(),
  note: z.string().trim().min(1).max(200).optional(),
  text: z.string().trim().min(1).max(200).optional(),
  due_at_local: LocalDateTime.optional(),
  remind_at_local: LocalDateTime.optional(),
  /** An id from the context (a task, Daftar entry or split). */
  ref: z.string().trim().min(1).max(64).optional(),
  answer: z.enum(["yes", "no"]).optional(),
  direction: z.enum(["owed_to_me", "i_owe"]).optional(),
  people: z.array(Name).max(20).optional(),
  checkin_kind: z.enum(["arrived", "home", "on_way", "medicine", "ok"]).optional(),
  setting: ChatSetting.optional(),
  screen: ChatScreen.optional(),
});
export type AppAction = z.infer<typeof AppAction>;

/** At most this many app actions in one turn. */
export const MAX_APP_ACTIONS = 4;

export const ChatActionStatus = z.enum(["done", "pending", "cancelled", "failed"]);
export type ChatActionStatus = z.infer<typeof ChatActionStatus>;

/**
 * The card under one of Zaki's replies: what Zaki did or wants to do, in the reader's words.
 * `route` opens the thing in the app ("/money/<id>", "/circle/<id>", "/trackers").
 * Pending cards show Send / Cancel; the user can also just answer "yes".
 */
export const ChatAction = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  status: ChatActionStatus,
  label: z.string(),
  route: z.string().nullable().default(null),
  /** A done card of the user's own change that "Undo" can take back (builds after 2026-11-23). */
  undoable: z.boolean().optional(),
});
export type ChatAction = z.infer<typeof ChatAction>;

/** Send / Cancel a pending card (`confirm`), or take back a done one (`undo: true`). */
export const ActOnChatActionRequest = z.union([z.object({ confirm: z.boolean() }), z.object({ undo: z.literal(true) })]);
export type ActOnChatActionRequest = z.infer<typeof ActOnChatActionRequest>;
