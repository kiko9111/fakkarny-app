import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { FriendResponse } from "@fakkarni/shared";

/** PRD §6: Claude Haiku for every conversation turn. */
export const FRIEND_MODEL = "claude-haiku-5-5";

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
  /** The user wrote in Latin letters (Franco/English): a reply with Arabic letters gets one retry. */
  latinOnly?: boolean;
}

export type FriendModelResult =
  | { ok: true; output: FriendResponse; usage: Usage }
  | { ok: false; reason: "refusal" | "invalid_output" | "max_tokens"; usage: Usage };

export interface FriendModel {
  respond(input: FriendModelInput): Promise<FriendModelResult>;
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
  nudge: z.string().nullable(),
  debt: z.object({ person: z.string(), amount: z.number(), direction: z.enum(["owed_to_me", "i_owe"]) }).nullable(),
});
const ModelUpdate = z.object({
  id: z.string(),
  title: z.string().nullable(),
  status: z.enum(["open", "done", "cancelled"]).nullable(),
  due_at_local: z.string().nullable(),
  remind_at_local: z.string().nullable(),
  follow_up_at_local: z.string().nullable(),
});
export const ModelOutput = z.object({
  reply: z.array(z.string()),
  create_items: z.array(ModelItem),
  update_items: z.array(ModelUpdate),
  save_memories: z.array(z.object({ kind: z.enum(["person", "place", "preference", "fact"]), subject: z.string(), content: z.string() })),
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

/** Loose model output → strict FriendResponse (throws ZodError if it doesn't fit). */
export function toFriendResponse(raw: ModelOutput): FriendResponse {
  return FriendResponse.parse({
    reply: capReplies(raw.reply),
    create_items: raw.create_items.map((i) => dropNulls(i)),
    update_items: raw.update_items.map((u) => dropNulls(u)),
    save_memories: raw.save_memories,
    crisis: raw.crisis,
  });
}

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
      // One retry if the output doesn't validate.
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await client.messages.parse({
          model: FRIEND_MODEL,
          max_tokens: 2000,
          system: [{ type: "text", text: input.system, cache_control: { type: "ephemeral" } }],
          messages: buildMessages(input),
          // Short chat replies: low effort keeps latency and cost down (PRD §7 latency target).
          output_config: { effort: "low", format: zodOutputFormat(ModelOutput) },
        });
        usage = addUsage(usage, toUsage(res.usage));
        if (res.stop_reason === "refusal") return { ok: false, reason: "refusal", usage };
        if (res.stop_reason === "max_tokens") return { ok: false, reason: "max_tokens", usage };
        if (!res.parsed_output) continue;
        try {
          const output = toFriendResponse(res.parsed_output);
          // Wrong script on a Franco/English message: try once more, then take what we get.
          if (input.latinOnly && attempt === 0 && /[\u0600-\u06FF]/.test(output.reply.join(" "))) continue;
          return { ok: true, output, usage };
        } catch {
          continue;
        }
      }
      return { ok: false, reason: "invalid_output", usage };
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
