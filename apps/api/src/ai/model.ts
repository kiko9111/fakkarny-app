import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { APP_ACTION_KINDS, AppAction, FriendResponse, MAX_APP_ACTIONS, MoneyKind, Receipt, TrackerKind, type PhotoUpload } from "@fakkarni/shared";
import { friendTools, readToolCalls, RespondInput } from "./tools";

/** PRD §6: Claude Haiku for every conversation turn. */
export const FRIEND_MODEL = process.env["FAKKARNI_FRIEND_MODEL"] || "claude-haiku-5-5";
/**
 * Medium, measured on the evals (2026-11-21): at "low" the model invented details when
 * reading Franco ("eggplant and pepper" became "chicken with shrimp"); medium did not,
 * for about 40% more cost per message and roughly half a second. FAKKARNI_FRIEND_EFFORT
 * and FAKKARNI_FRIEND_MODEL override these for experiments.
 */
const FRIEND_EFFORT = (process.env["FAKKARNI_FRIEND_EFFORT"] || "medium") as "low" | "medium" | "high";

/** USD per million tokens for FRIEND_MODEL (prompts ≤100K tokens). Used for cost tracking (FR-15). */
export const PRICING = { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 } as const;

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export function costUsd(u: Usage): number {
  return (
    (u.input_tokens * PRICING.input +
      u.output_tokens * PRICING.output +
      u.cache_read_input_tokens * PRICING.cacheRead +
      u.cache_creation_input_tokens * PRICING.cacheWrite) /
    1_000_000
  );
}

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

export interface FriendModelInput {
  system: string;
  context: string;
  history: ChatTurn[];
  /** The user wrote Arabic or Franco: a reply without Arabic letters gets one retry. */
  requireArabic?: boolean;
  /** Today's local date ("YYYY-MM-DD"): a new reminder or task dated before it gets one retry. */
  todayLocal?: string;
}

/** The model's validated answer. app_actions may be left out (scripted test models). */
export type FriendOutput = Omit<FriendResponse, "app_actions"> & { app_actions?: FriendResponse["app_actions"] };
export type FriendModelResult =
  | { ok: true; output: FriendOutput; usage: Usage }
  | { ok: false; reason: "refusal" | "invalid_output" | "max_tokens"; usage: Usage };

/** One Session turn: what Zaki says, whether this is a crisis, and at most one small step. */
export const SessionTurn = z.object({
  reply: z.array(z.string()),
  crisis: z.boolean(),
  step: z.object({ title: z.string(), remind_at_local: z.string().nullable() }).nullable(),
});
export type SessionTurn = z.infer<typeof SessionTurn>;
export type SessionTurnResult = { ok: true; output: SessionTurn; usage: Usage } | { ok: false; reason: "refusal" | "invalid_output" | "max_tokens"; usage: Usage };

/**
 * Receipt reading output: no nullable or optional fields (the structured-output limits are
 * per request, but keep it lean). "" / 0 mean not printed; `readable` false = not a receipt.
 */
const ModelReceipt = z.object({
  readable: z.boolean(),
  merchant: z.string(),
  date: z.string(),
  currency: z.string(),
  total: z.number(),
  subtotal: z.number(),
  service: z.number(),
  vat: z.number(),
  category: z.string(),
  items: z.array(z.object({ name: z.string(), price: z.number(), qty: z.number() })),
});

export const RECEIPT_SYSTEM = `You read one photo of a shop or restaurant receipt for an Egyptian household app. Extract only what is printed; never guess numbers.
- readable: false if it is not a receipt or the totals can't be read (then leave the rest empty).
- merchant: the shop or restaurant name as printed (keep its script). date: YYYY-MM-DD, or "".
- currency: "EGP" unless another is printed. total: the final amount paid, service and VAT included.
- subtotal: before service and VAT, 0 if not printed. service and vat: the printed amounts (not percentages), 0 if none.
- items: each line item with its line price (price for the whole line, qty as printed, 1 if none). At most 60. Leave out totals, taxes and discounts lines.
- category: one or two plain words for the kind of spending, in the requested language (e.g. "بقالة", "مطاعم", "صيدلية" / "groceries", "restaurants", "pharmacy").
Numbers: Arabic-Indic digits are digits; commas are thousands separators.`;

/** Validate and tidy the model's reading. Null when it isn't a usable receipt. */
export function toReceipt(raw: z.infer<typeof ModelReceipt>): Receipt | null {
  if (!raw.readable || !(raw.total > 0)) return null;
  const money = (n: number) => (Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0);
  const parsed = Receipt.safeParse({
    merchant: raw.merchant.trim().slice(0, 80),
    date: /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : null,
    currency: (raw.currency || "EGP").trim().slice(0, 8).toUpperCase(),
    total: money(raw.total),
    subtotal: money(raw.subtotal) || null,
    service: money(raw.service),
    vat: money(raw.vat),
    category: raw.category.trim().slice(0, 40),
    items: raw.items
      .filter((i) => i.name.trim() && money(i.price) > 0)
      .slice(0, 60)
      .map((i) => ({ name: i.name.trim().slice(0, 80), price: money(i.price), qty: Math.max(1, Math.round(i.qty) || 1) })),
  });
  return parsed.success ? parsed.data : null;
}

export interface FriendModel {
  /** Read a receipt photo (owner decision 2026-11-23: photos for receipts and homework only). */
  readReceipt?(input: { photo: PhotoUpload; language: "ar" | "en" }): Promise<{ receipt: Receipt | null; usage: Usage }>;
  respond(input: FriendModelInput): Promise<FriendModelResult>;
  /** A Session turn (apps/api/src/session). Separate prompt, separate output; never creates items or memories. */
  reflect?(input: { system: string; context: string; history: ChatTurn[] }): Promise<SessionTurnResult>;
  /** Plain-text completion for summaries and proactive messages (no structured output). */
  complete(input: { system: string; prompt: string; maxTokens?: number }): Promise<{ text: string; usage: Usage }>;
}

/**
 * Schema handed to the API for structured output. It is deliberately loose (nullable
 * instead of optional, no length/format constraints); the strict shared FriendResponse
 * schema validates the result afterwards (CLAUDE.md: every AI output is validated with zod).
 */
const ModelItem = z.object({
  type: z.enum(["task", "reminder", "note", "list_item", "debt"]),
  title: z.string(),
  due_at_local: z.string().nullable(),
  remind_at_local: z.string().nullable(),
  follow_up_at_local: z.string().nullable(),
  important: z.boolean(),
  alarm: z.boolean(),
  nudge: z.string().nullable(),
  repeat_every_minutes: z.number().nullable(),
  debt: z.object({ person: z.string(), amount: z.number(), direction: z.enum(["owed_to_me", "i_owe"]) }).nullable(),
});
const ModelUpdate = z.object({
  id: z.string(),
  title: z.string().nullable(),
  status: z.enum(["open", "done", "cancelled"]).nullable(),
  due_at_local: z.string().nullable(),
  remind_at_local: z.string().nullable(),
  follow_up_at_local: z.string().nullable(),
  repeat_every_minutes: z.number().nullable(),
  alarm: z.boolean().nullable(),
});
/**
 * App actions use no nullable fields: the API allows at most 16 union-typed (nullable)
 * parameters across the whole output schema, and items + updates already use 12. A 400
 * "schema too complex" there fails every turn. Unused fields come back as "", 0, [] or
 * false and are dropped in `toAppActions`.
 */
const ModelAppAction = z.object({
  kind: z.enum(APP_ACTION_KINDS),
  name: z.string(),
  title: z.string(),
  section: z.string(),
  tracker: z.string(),
  circle: z.string(),
  person: z.string(),
  amount: z.number(),
  money_kind: z.string(),
  tracker_kind: z.string(),
  unit: z.string(),
  ask_times: z.array(z.string()),
  family: z.boolean(),
  homework: z.boolean(),
  note: z.string(),
  text: z.string(),
  due_at_local: z.string(),
  remind_at_local: z.string(),
  ref: z.string(),
  answer: z.string(),
  direction: z.string(),
  people: z.array(z.string()),
  checkin_kind: z.string(),
  setting: z.string(),
  screen: z.string(),
});
/**
 * The single structured output, kept as the fallback when a tool-call turn has no usable
 * `respond` (and for FAKKARNI_CHAT_TOOLS=0). Normal turns use tools (./tools.ts).
 */
export const ModelOutput = z.object({
  reply: z.array(z.string()),
  create_items: z.array(ModelItem),
  update_items: z.array(ModelUpdate),
  save_memories: z.array(z.object({ kind: z.enum(["person", "place", "preference", "fact"]), subject: z.string(), content: z.string() })),
  app_actions: z.array(ModelAppAction),
  crisis: z.boolean(),
});
export type ModelOutput = z.infer<typeof ModelOutput>;

/** Drop nulls and blank strings ("" for "no nudge") so optional fields are simply absent. */
const dropNulls = <T extends Record<string, unknown>>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && !(typeof v === "string" && !v.trim())));

/** The persona allows 1–3 messages; if the model sends more, fold the extras into the third instead of losing the turn. */
function capReplies(reply: string[], max = 3): string[] {
  const clean = reply.map((r) => r.trim()).filter(Boolean);
  return clean.length <= max ? clean : [...clean.slice(0, max - 1), clean.slice(max - 1).join(" ")];
}

/**
 * Model app actions → valid AppActions. "", 0, [] and false mean "not given"; amount 0 on
 * set_budget means "remove the budget". An action that still doesn't fit is dropped on its
 * own, so one odd action never costs the user their reply.
 */
export function toAppActions(raw: ModelOutput["app_actions"]): AppAction[] {
  return raw.slice(0, MAX_APP_ACTIONS).flatMap((a) => {
    const o: Record<string, unknown> = dropNulls(a);
    if (!a.ask_times.length) delete o["ask_times"];
    if (!a.people?.length) delete o["people"];
    if (!a.family) delete o["family"];
    if (!a.homework) delete o["homework"];
    if (!(a.amount > 0)) {
      if (a.kind === "set_budget") o["amount"] = null;
      else delete o["amount"];
    }
    if (!MoneyKind.safeParse(a.money_kind).success) delete o["money_kind"];
    if (!TrackerKind.safeParse(a.tracker_kind).success) delete o["tracker_kind"];
    const parsed = AppAction.safeParse(o);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Loose model output → strict FriendResponse (throws ZodError if it doesn't fit). */
export function toFriendResponse(raw: ModelOutput): FriendResponse {
  return FriendResponse.parse({
    reply: capReplies(raw.reply),
    create_items: raw.create_items.map((i) => dropNulls(i)),
    update_items: raw.update_items.map((u) => dropNulls(u)),
    save_memories: raw.save_memories,
    app_actions: toAppActions(raw.app_actions ?? []),
    crisis: raw.crisis,
  });
}

/** A tool-call turn → strict FriendResponse (throws when `respond` is missing or doesn't fit). */
export function toolTurnToFriendResponse(content: Anthropic.ContentBlock[]): FriendResponse {
  const { respond, actions } = readToolCalls(content);
  if (!respond) throw new Error("no respond call");
  const r = RespondInput.parse(respond);
  return FriendResponse.parse({
    reply: capReplies(r.reply),
    create_items: r.create_items.map((i) => dropNulls(i)),
    update_items: r.update_items.map((u) => dropNulls(u)),
    save_memories: r.save_memories,
    app_actions: actions,
    crisis: r.crisis,
  });
}

/** Tool calls for chat turns; FAKKARNI_CHAT_TOOLS=0 goes back to the single structured output. */
const CHAT_TOOLS = process.env["FAKKARNI_CHAT_TOOLS"] !== "0";

const TOOL_TURN_NOTE =
  "\n\n# How to answer\nAnswer by calling tools, all in one message: `respond` exactly once (your reply, items, memories, crisis flag), plus any app tools the message needs (money, daftar, tracker, circle, task, split, app). You never see tool results: the app runs them after your turn and shows a card under your reply, so write the reply as if they are done, or for a card that waits for the user's OK, ask. Never write text outside the tools.";

const zeroUsage: Usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const toUsage = (u: Anthropic.Usage): Usage => ({
  input_tokens: u.input_tokens,
  output_tokens: u.output_tokens,
  cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
  cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
});
const addUsage = (a: Usage, b: Usage): Usage => ({
  input_tokens: a.input_tokens + b.input_tokens,
  output_tokens: a.output_tokens + b.output_tokens,
  cache_read_input_tokens: a.cache_read_input_tokens + b.cache_read_input_tokens,
  cache_creation_input_tokens: a.cache_creation_input_tokens + b.cache_creation_input_tokens,
});

/** Build the messages array: context first (so it starts with a user turn), then the chat. */
export function buildMessages(input: FriendModelInput): Anthropic.MessageParam[] {
  return [
    { role: "user", content: `<context>\n${input.context}\n</context>\nThe conversation follows. Answer the last user message.` },
    ...input.history.map((t): Anthropic.MessageParam => ({ role: t.role, content: t.text })),
  ];
}

/**
 * The app's API key. FAKKARNI_ANTHROPIC_API_KEY wins, for shells where the tooling
 * removes or owns ANTHROPIC_API_KEY (e.g. Claude Code cloud sessions).
 */
export function anthropicApiKey(): string | undefined {
  return process.env["FAKKARNI_ANTHROPIC_API_KEY"] || process.env["ANTHROPIC_API_KEY"] || undefined;
}

export function createAnthropicModel(opts: { apiKey?: string; baseURL?: string } = {}): FriendModel {
  const client = new Anthropic({
    apiKey: opts.apiKey ?? anthropicApiKey(),
    // Explicit, so a tooling-level ANTHROPIC_BASE_URL in the shell never redirects app traffic.
    baseURL: opts.baseURL ?? process.env["FAKKARNI_ANTHROPIC_BASE_URL"] ?? "https://api.anthropic.com",
    maxRetries: 2,
    timeout: 30_000,
  });

  return {
    async respond(input) {
      let usage = zeroUsage;
      // One retry if the output doesn't validate. The first try uses tools; when that turn has
      // no usable `respond` (or the tools request fails), the retry uses the structured output.
      for (let attempt = 0; attempt < 2; attempt++) {
        let output: FriendResponse | null = null;
        if (CHAT_TOOLS && attempt === 0) {
          try {
            const res = await client.messages.create({
              model: FRIEND_MODEL,
              max_tokens: 2000,
              tools: friendTools(),
              // "any": a turn always answers through the tools (respond plus any app tools), never loose text.
              tool_choice: { type: "any" },
              system: [{ type: "text", text: input.system + TOOL_TURN_NOTE, cache_control: { type: "ephemeral" } }],
              messages: buildMessages(input),
              output_config: { effort: FRIEND_EFFORT },
            });
            usage = addUsage(usage, toUsage(res.usage));
            if (res.stop_reason === "refusal") return { ok: false, reason: "refusal", usage };
            if (res.stop_reason === "max_tokens") return { ok: false, reason: "max_tokens", usage };
            output = toolTurnToFriendResponse(res.content);
          } catch (err) {
            // A bad request (e.g. a schema the API rejects) must never cost the reply: retry below.
            if (err instanceof Anthropic.APIError && err.status !== 400) throw err;
            continue;
          }
        } else {
          const res = await client.messages.parse({
            model: FRIEND_MODEL,
            max_tokens: 2000,
            system: [{ type: "text", text: input.system, cache_control: { type: "ephemeral" } }],
            messages: buildMessages(input),
            output_config: { effort: FRIEND_EFFORT, format: zodOutputFormat(ModelOutput) },
          });
          usage = addUsage(usage, toUsage(res.usage));
          if (res.stop_reason === "refusal") return { ok: false, reason: "refusal", usage };
          if (res.stop_reason === "max_tokens") return { ok: false, reason: "max_tokens", usage };
          if (!res.parsed_output) continue;
          try {
            output = toFriendResponse(res.parsed_output);
          } catch {
            continue;
          }
        }
        {
          // Franco or English back to an Arabic/Franco message: try once more, then take what we get.
          if (input.requireArabic && attempt === 0 && !output.reply.every((r) => /[\u0600-\u06FF]/.test(r))) continue;
          // "Before the 10th" said on the 19th sometimes comes back as the 10th just gone.
          const today = input.todayLocal;
          const pastDue = today && output.create_items.some((i) => (i.type === "reminder" || i.type === "task") && i.due_at_local && i.due_at_local.slice(0, 10) < today);
          if (pastDue && attempt === 0) continue;
          return { ok: true, output, usage };
        }
      }
      return { ok: false, reason: "invalid_output", usage };
    },

    async reflect(input) {
      let usage = zeroUsage;
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await client.messages.parse({
          model: FRIEND_MODEL,
          max_tokens: 1200,
          system: [{ type: "text", text: input.system, cache_control: { type: "ephemeral" } }],
          messages: buildMessages(input),
          output_config: { effort: FRIEND_EFFORT, format: zodOutputFormat(SessionTurn) },
        });
        usage = addUsage(usage, toUsage(res.usage));
        if (res.stop_reason === "refusal") return { ok: false, reason: "refusal", usage };
        if (res.stop_reason === "max_tokens") return { ok: false, reason: "max_tokens", usage };
        const reply = res.parsed_output ? capReplies(res.parsed_output.reply) : [];
        if (res.parsed_output && reply.length) return { ok: true, output: { ...res.parsed_output, reply }, usage };
      }
      return { ok: false, reason: "invalid_output", usage };
    },

    async readReceipt({ photo, language }) {
      const res = await client.messages.parse({
        model: FRIEND_MODEL,
        max_tokens: 3000,
        system: [{ type: "text", text: RECEIPT_SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: photo.mime, data: photo.data.replace(/\s+/g, "") } },
              { type: "text", text: `Read this receipt. Category language: ${language === "en" ? "English" : "Egyptian Arabic"}.` },
            ],
          },
        ],
        output_config: { effort: "low", format: zodOutputFormat(ModelReceipt) },
      });
      const usage = toUsage(res.usage);
      return { receipt: res.parsed_output ? toReceipt(res.parsed_output) : null, usage };
    },

    async complete({ system, prompt, maxTokens = 1000 }) {
      const res = await client.messages.create({
        model: FRIEND_MODEL,
        max_tokens: maxTokens,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: prompt }],
        output_config: { effort: "low" },
      });
      const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
      return { text, usage: toUsage(res.usage) };
    },
  };
}
