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
}

export interface PipelineResult {
  replies: Message[];
  items: Item[];
  memories: Memory[];
  /** Today's AI allowance after this message, when one applies. */
  aiAllowance?: { limit: number | null; used: number };
}

/** Runs after a user message is stored: decides the friend's reply and what to remember. */
export type MessagePipeline = (input: PipelineInput) => Promise<PipelineResult>;

/** M2 placeholder: store only, no reply. M3 replaces it with the Claude pipeline. */
export const noopPipeline: MessagePipeline = async () => ({ replies: [], items: [], memories: [] });
