import { z } from "zod";

/**
 * Product analytics (owner ask, 2026-11-23: "count anything, never the chat words"). The phone
 * sends counted events; the server stores them as Event rows named "app:<name>". Props are
 * short labels and numbers only: never message text, names, amounts or anything typed.
 */
export const APP_EVENTS = [
  "screen", // props.route: the route pattern, ids replaced ("/circle/[id]")
  "place_introduced", // Zaki introduced a place (props.place)
  "place_opened", // props.place, props.via: "tap" | "ask"
  "link_task_sent", // a task sent by link to someone not on Zaki
  "list_link_sent", // a household list's no-app link sent
  "place_overview", // "what can you do?"
  "starter_tapped", // a starter chip on the first chat (props.index)
  "quick_reply", // a quick reply chip (props.index)
  "invite_shared", // props.via: "upsell" | "settings" | "circle"
  "referral_claimed",
  "paywall_opened", // props.from
  "signin_done", // props.method
  "tracker_suggest_tapped",
  "empty_starter_tapped", // props.place
  "split_created", // props.people, props.items (counts only)
  "homework_handed_in",
  "streak_milestone", // props.days
  "split_to_daftar", // props.entries (count)
  "streak_shared", // props.days
  "split_card_shared",
  "receipt_read", // props.ok, props.items (count), props.for: "daftar" | "split"
  "receipt_logged",
  "receipt_split",
  "homework_photos", // props.count
  "homework_help", // the parent asked Zaki to explain a lesson: props.ok, props.photos (count)
  "homework_check", // the child asked Zaki to look at their answers: props.ok, props.hints (count)
  "homework_plan_sent", // a week's homework from one message: props.count, props.rewards (count)
  "homework_practice_sent", // practice questions sent to the child as homework
  "pocket_paid", // a parent marked pocket money as handed over
  "list_item_added", // a thing added to a household list from its screen
  "list_item_done", // a thing ticked off on a household list
  "list_trip", // "I'm going shopping" tapped
  "chat_reply", // a chat reply arrived: props.total / props.think (ms), props.brain, props.ok, props.first (ms to its first words, when they came ahead)
  "forward_in", // something shared or pasted for Zaki: props.kind "chat" | "receipt" | "none", props.source "share" | "paste"
  "forward_sent", // the chat sent a forwarded message (props.chars: its length, rounded to 100)
] as const;
export const AppEventName = z.enum(APP_EVENTS);
export type AppEventName = z.infer<typeof AppEventName>;

const PropValue = z.union([z.string().max(60), z.number().finite(), z.boolean()]);
export const AppEventProps = z.record(z.string().max(30), PropValue).refine((p) => Object.keys(p).length <= 8, "too many props");
export type AppEventProps = z.infer<typeof AppEventProps>;

export const AppEvent = z.object({
  name: AppEventName,
  props: AppEventProps.default({}),
  /** When it happened on the phone (ISO). The server clamps it to the last 7 days. */
  at: z.string().datetime(),
});
export type AppEvent = z.infer<typeof AppEvent>;

/** POST /events */
export const PostEventsRequest = z.object({ events: z.array(AppEvent).min(1).max(50) });
export type PostEventsRequest = z.infer<typeof PostEventsRequest>;
