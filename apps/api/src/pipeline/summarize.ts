import type { PrismaClient, User } from "../generated/prisma/client";
import type { FriendModel } from "../ai/model";
import { RECENT_MESSAGES } from "./context";

/** Summarize once this many messages have piled up since the last summary (PRD §6 step 5: ~every 30). */
export const SUMMARY_THRESHOLD = 30;

const SUMMARY_SYSTEM = `You compress a chat between a user and their AI friend Zaki into a rolling summary the friend can read later.
Write in English, at most 150 words, plain prose. Keep: names and who they are, plans and commitments, money owed, how the user is feeling, things they care about, open questions. Merge in the previous summary. Do not invent anything.`;

/**
 * Fold older messages into the rolling summary so context stays small and cheap.
 * Keeps the last RECENT_MESSAGES out of the summary (they're sent verbatim).
 */
export async function summarizeIfNeeded(prisma: PrismaClient, model: FriendModel, user: User): Promise<boolean> {
  const last = await prisma.summary.findFirst({ where: { userId: user.id }, orderBy: { periodEnd: "desc" } });
  const pending = await prisma.message.findMany({
    where: { userId: user.id, ...(last ? { createdAt: { gt: last.periodEnd } } : {}) },
    orderBy: { createdAt: "asc" },
  });
  if (pending.length < SUMMARY_THRESHOLD + RECENT_MESSAGES) return false;

  const batch = pending.slice(0, pending.length - RECENT_MESSAGES);
  const first = batch[0]!;
  const lastMsg = batch[batch.length - 1]!;
  const transcript = batch.map((m) => `${m.role === "user" ? "User" : "Zaki"}: ${m.text}`).join("\n");
  const { text } = await model.complete({
    system: SUMMARY_SYSTEM,
    prompt: `${last ? `PREVIOUS SUMMARY:\n${last.text}\n\n` : ""}NEW MESSAGES:\n${transcript}`,
    maxTokens: 600,
  });
  if (!text) return false;
  await prisma.summary.create({
    data: { userId: user.id, periodStart: last?.periodStart ?? first.createdAt, periodEnd: lastMsg.createdAt, text },
  });
  return true;
}
