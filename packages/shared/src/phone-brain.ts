import { z } from "zod";

/**
 * Zaki's on-device brain (Android test mode, 2026-11-25). A small model on the phone writes
 * this compact JSON instead of the cloud model's big structured output; the server turns it
 * into a FriendResponse (apps/api/src/ai/phone.ts) and validates it like any AI output.
 *
 * Kept short and flat on purpose: a 1–2B model fills a few simple fields far more reliably
 * than the 25-field cloud schema. Every field but reply and crisis may be left out.
 */

/** App actions the phone model may ask for. The server resolves names and makes cards, as for the cloud. */
export const PHONE_ACTION_KINDS = [
  "log_money",
  "create_section",
  "set_budget",
  "create_tracker",
  "log_tracker",
  "create_circle",
  "assign_task",
  "ask_circle",
  "daftar_add",
  "checkin",
  "open_screen",
] as const;

export const PHONE_ITEM_TYPES = ["reminder", "task", "note", "list_item", "debt"] as const;
export const PHONE_MEMORY_KINDS = ["person", "place", "preference", "fact"] as const;

const timeField = { type: "string", description: "Local time YYYY-MM-DDTHH:mm, or +N minutes from now like +60" };

/**
 * JSON Schema handed to llama.cpp, which turns it into a grammar: the model can only write
 * JSON of this shape. Optional properties are allowed (llama.cpp json-schema-to-grammar).
 */
export const PHONE_OUTPUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 },
    items: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: [...PHONE_ITEM_TYPES] },
          title: { type: "string" },
          when: timeField,
          remind: timeField,
          follow_up: timeField,
          repeat_minutes: { type: "integer" },
          important: { type: "boolean" },
          alarm: { type: "boolean" },
          person: { type: "string" },
          amount: { type: "number" },
          direction: { type: "string", enum: ["owed_to_me", "i_owe"] },
        },
        required: ["type", "title"],
      },
    },
    updates: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          status: { type: "string", enum: ["open", "done", "cancelled"] },
          when: timeField,
          remind: timeField,
          alarm: { type: "boolean" },
        },
        required: ["id"],
      },
    },
    memories: {
      type: "array",
      maxItems: 2,
      items: {
        type: "object",
        properties: { kind: { type: "string", enum: [...PHONE_MEMORY_KINDS] }, subject: { type: "string" }, content: { type: "string" } },
        required: ["kind", "subject", "content"],
      },
    },
    actions: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: [...PHONE_ACTION_KINDS] },
          name: { type: "string" },
          amount: { type: "number" },
          money_kind: { type: "string", enum: ["expense", "income"] },
          section: { type: "string" },
          tracker: { type: "string" },
          tracker_kind: { type: "string" },
          circle: { type: "string" },
          person: { type: "string" },
          title: { type: "string" },
          when: timeField,
          direction: { type: "string", enum: ["owed_to_me", "i_owe"] },
          screen: { type: "string" },
          checkin_kind: { type: "string" },
        },
        required: ["kind"],
      },
    },
    crisis: { type: "boolean" },
  },
  required: ["reply", "crisis"],
} as const;

const s = z.string().max(400);
const time = z.string().max(40);

/** Loose parse of what the phone sent (the strict FriendResponse check happens after conversion). */
export const PhoneOutput = z.object({
  reply: z.array(z.string().max(1000)).min(1).max(6),
  items: z
    .array(
      z.object({
        type: z.enum(PHONE_ITEM_TYPES),
        title: s,
        when: time.optional(),
        remind: time.optional(),
        follow_up: time.optional(),
        repeat_minutes: z.number().optional(),
        important: z.boolean().optional(),
        alarm: z.boolean().optional(),
        person: s.optional(),
        amount: z.number().optional(),
        direction: z.enum(["owed_to_me", "i_owe"]).optional(),
      }),
    )
    .max(8)
    .default([]),
  updates: z
    .array(z.object({ id: z.string().max(64), status: z.enum(["open", "done", "cancelled"]).optional(), when: time.optional(), remind: time.optional(), alarm: z.boolean().optional() }))
    .max(6)
    .default([]),
  memories: z.array(z.object({ kind: z.enum(PHONE_MEMORY_KINDS), subject: s, content: s })).max(4).default([]),
  actions: z
    .array(
      z.object({
        kind: z.enum(PHONE_ACTION_KINDS),
        name: s.optional(),
        amount: z.number().optional(),
        money_kind: z.string().max(20).optional(),
        section: s.optional(),
        tracker: s.optional(),
        tracker_kind: z.string().max(30).optional(),
        circle: s.optional(),
        person: s.optional(),
        title: s.optional(),
        when: time.optional(),
        direction: z.string().max(20).optional(),
        screen: z.string().max(40).optional(),
        checkin_kind: z.string().max(30).optional(),
      }),
    )
    .max(6)
    .default([]),
  crisis: z.boolean().default(false),
});
export type PhoneOutput = z.infer<typeof PhoneOutput>;

/** Reply mode: the rule engine decided everything, the phone's model only writes the reply. */
export const PHONE_REPLY_JSON_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 2 },
    crisis: { type: "boolean" },
  },
  required: ["reply", "crisis"],
} as const;

/** What the server hands the phone when it wants the phone's model to answer (POST /messages → 202). */
export const PhoneBrainRequest = z.object({
  /** Short persona for small models (apps/api/src/persona/phone.ts). */
  system: z.string(),
  /** Compact per-user context (now, dates, items with ids, names in the app). */
  context: z.string(),
  /** The last few turns, oldest first; the last one is the message to answer. */
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string() })),
  /** Version of the phone persona, sent back with the answer for the cost/quality event. */
  persona: z.string(),
  /**
   * The JSON schema the phone's grammar should use. Set in reply mode (the code already did the
   * work, the model writes only {reply, crisis}); absent = PHONE_OUTPUT_JSON_SCHEMA (older servers).
   */
  schema: z.record(z.string(), z.unknown()).optional(),
});
export type PhoneBrainRequest = z.infer<typeof PhoneBrainRequest>;

/** POST /messages answered with 202: no reply yet, the phone's model has to write one. */
export const NeedsBrainResponse = z.object({ needs_brain: PhoneBrainRequest });
export type NeedsBrainResponse = z.infer<typeof NeedsBrainResponse>;

/**
 * Pull the JSON object out of what a small model wrote (grammar-constrained output is plain
 * JSON, but a model without a grammar may wrap it in prose or a code fence). Null when none parses.
 */
export function extractPhoneJson(text: string): unknown {
  const t = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  try {
    return JSON.parse(t);
  } catch {
    /* fall through */
  }
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * The chat messages a phone model gets: the system prompt, the context as the first user turn,
 * then the conversation. Shared so the phone and the eval runner prompt exactly alike.
 */
export function phoneMessages(req: PhoneBrainRequest): { role: "system" | "user" | "assistant"; content: string }[] {
  const turns = req.history.map((t) => ({ role: t.role, content: t.text }));
  const last = turns.pop();
  const intro = { role: "user" as const, content: `<context>\n${req.context}\n</context>\nThe conversation follows. Answer only the last user message, as JSON.` };
  const ack = { role: "assistant" as const, content: "{\"reply\":[\"OK\"],\"crisis\":false}" };
  return [{ role: "system", content: req.system }, intro, ack, ...turns.map((t) => (t.role === "assistant" ? { ...t, content: JSON.stringify({ reply: [t.content], crisis: false }) } : t)), ...(last ? [last] : [])];
}
