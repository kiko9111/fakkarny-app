import { z } from "zod";
import { AskTime, MAX_ASK_TIMES, TrackerKind } from "./trackers";
import { MoneyKind } from "./money";

/**
 * Things Zaki can do in the app from the chat, beyond reminders and memories: money sections and
 * budgets, logging money, trackers, circles, assigning tasks and asking a circle something.
 * The model names things (a section, tracker, circle or person) and the server resolves the
 * names. Anything that messages other people waits for the user's OK (a card in the chat).
 */
export const APP_ACTION_KINDS = [
  "log_money",
  "create_section",
  "set_budget",
  "create_tracker",
  "log_tracker",
  "update_tracker",
  "create_circle",
  "assign_task",
  "ask_circle",
] as const;
export const AppActionKind = z.enum(APP_ACTION_KINDS);
export type AppActionKind = z.infer<typeof AppActionKind>;

/** Kinds that reach other people: they wait for the user's OK. */
export const CONFIRM_KINDS: readonly AppActionKind[] = ["assign_task", "ask_circle"];

const Name = z.string().trim().min(1).max(60);
const LocalDateTime = z.iso.datetime({ local: true });

/**
 * One app action from the model, validated. Which fields matter depends on `kind`:
 * - log_money: amount, money_kind, note?, section? (a section or shared book name)
 * - create_section: name, money_kind, amount? (monthly budget), circle? (makes it a shared book)
 * - set_budget: section, amount (null clears it)
 * - create_tracker: name, tracker_kind?, amount? (daily goal), unit?, ask_times?, circle? (share it)
 * - log_tracker: tracker, amount?
 * - update_tracker: tracker, amount? (goal), ask_times?
 * - create_circle: name, family?
 * - assign_task: person, title, circle?, due_at_local?, remind_at_local?, homework?, note?
 * - ask_circle: circle?, text (what to ask, e.g. "remind everyone about Friday lunch")
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
});
export type AppAction = z.infer<typeof AppAction>;

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
});
export type ChatAction = z.infer<typeof ChatAction>;

export const ActOnChatActionRequest = z.object({ confirm: z.boolean() });
export type ActOnChatActionRequest = z.infer<typeof ActOnChatActionRequest>;
