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
  "place_overview", // "what can you do?"
  "starter_tapped", // a starter chip on the first chat (props.index)
  "quick_reply", // a quick reply chip (props.index)
  "invite_shared", // props.via: "upsell" | "settings" | "circle"
  "referral_claimed",
  "paywall_opened", // props.from
  "signin_done", // props.method
  "tracker_suggest_tapped",
  "empty_starter_tapped", // props.place
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
