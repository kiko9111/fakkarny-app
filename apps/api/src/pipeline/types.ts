import type { PhoneBrainRequest } from "@fakkarni/shared";
import type { Item, Memory, Message, PrismaClient, User } from "../generated/prisma/client";

export interface PipelineInput {
  prisma: PrismaClient;
  user: User;
  /** The user's message, already stored. */
  message: Message;
  /** Current instant (injected for tests). */
  now: Date;
  /** AI messages allowed today (free plan); null or absent = unlimited (Pro, or not enforced). */
  aiAllowance?: number | null;
  /** Paid extras are enforced (REQUIRE_SUBSCRIPTION=1); passed on to circle actions. */
  requireSubscription?: boolean;
  /**
   * Zaki's model runs on the phone (Android test mode). Without output the pipeline stops where
   * it would call the model and returns needsBrain; with output it uses the phone's answer.
   */
  brain?: { output?: unknown; model?: string };
  /** Filled with ms-since-start marks (rules, context, model, saved) so the route can report where the wait went. */
  timing?: Record<string, number>;
}

export interface PipelineResult {
  replies: Message[];
  items: Item[];
  memories: Memory[];
  /** Pushes to send after the reply (e.g. a circle task finished in chat tells its assigner). */
  notices?: { userId: string; text: string }[];
  /** Today's AI allowance after this message, when one applies. */
  aiAllowance?: { limit: number | null; used: number };
  /** The phone's model has to write the reply: nothing was stored for this turn yet. */
  needsBrain?: PhoneBrainRequest;
}

/** Runs after a user message is stored: decides the friend's reply and what to remember. */
export type MessagePipeline = (input: PipelineInput) => Promise<PipelineResult>;

/** M2 placeholder: store only, no reply. M3 replaces it with the Claude pipeline. */
export const noopPipeline: MessagePipeline = async () => ({ replies: [], items: [], memories: [] });
