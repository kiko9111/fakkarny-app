import type { FriendResponse } from "@fakkarni/shared";
import type { Item, Memory, Message, Prisma, PrismaClient, User } from "../generated/prisma/client";
import { localToUtc } from "../lib/time";

type Tx = Prisma.TransactionClient;

export const replyClientId = (userClientId: string, n: number) => `${userClientId}:reply:${n}`;

/** Local wall-clock → UTC; null if missing or unparseable (never throw on model output). */
export function safeLocalToUtc(local: string | undefined, tz: string): Date | null {
  if (!local) return null;
  try {
    const d = localToUtc(local, tz);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

export interface ApplyInput {
  user: User;
  message: Message;
  replies: string[];
  response: Pick<FriendResponse, "create_items" | "update_items" | "save_memories">;
  now: Date;
}

export interface ApplyResult {
  replies: Message[];
  items: Item[];
  memories: Memory[];
}

/**
 * Apply validated actions in one transaction (PRD §6 pipeline step 4).
 * Updates only touch the user's own open items; unknown ids are ignored.
 */
export async function applyActions(prisma: PrismaClient, input: ApplyInput): Promise<ApplyResult> {
  const { user, message, now } = input;
  const tz = user.timezone;

  return prisma.$transaction(async (tx: Tx) => {
    const items: Item[] = [];
    const memories: Memory[] = [];

    for (const c of input.response.create_items) {
      const dueAt = safeLocalToUtc(c.due_at_local, tz);
      let remindAt = safeLocalToUtc(c.remind_at_local, tz);
      // A reminder always needs a nudge time; fall back to the due time.
      if (c.type === "reminder" && !remindAt) remindAt = dueAt;
      items.push(
        await tx.item.create({
          data: {
            userId: user.id,
            type: c.type,
            title: c.title,
            dueAt,
            remindAt,
            followUpAt: safeLocalToUtc(c.follow_up_at_local, tz),
            important: c.important ?? false,
            debtPerson: c.debt?.person ?? null,
            debtAmount: c.debt?.amount ?? null,
            debtDirection: c.debt?.direction ?? null,
            sourceMessageId: message.id,
          },
        }),
      );
    }

    if (input.response.update_items.length) {
      const ids = input.response.update_items.map((u) => u.id);
      const owned = new Set(
        (await tx.item.findMany({ where: { userId: user.id, id: { in: ids.filter(isUuid) } }, select: { id: true } })).map((r) => r.id),
      );
      for (const u of input.response.update_items) {
        if (!owned.has(u.id)) continue;
        const data: Prisma.ItemUpdateInput = {};
        if (u.title) data.title = u.title;
        if (u.status) {
          data.status = u.status;
          data.doneAt = u.status === "done" ? now : null;
        }
        const due = safeLocalToUtc(u.due_at_local, tz);
        if (due) data.dueAt = due;
        const remind = safeLocalToUtc(u.remind_at_local, tz);
        if (remind) data.remindAt = remind;
        else if (due) data.remindAt = due; // moved without a new nudge time: nudge at the new time
        const follow = safeLocalToUtc(u.follow_up_at_local, tz);
        if (follow) data.followUpAt = follow;
        items.push(await tx.item.update({ where: { id: u.id }, data }));
      }
    }

    for (const m of input.response.save_memories) {
      const existing = await tx.memory.findFirst({
        where: { userId: user.id, kind: m.kind, subject: { equals: m.subject, mode: "insensitive" } },
      });
      memories.push(
        existing
          ? await tx.memory.update({ where: { id: existing.id }, data: { content: m.content, lastUsedAt: now } })
          : await tx.memory.create({ data: { userId: user.id, kind: m.kind, subject: m.subject, content: m.content } }),
      );
    }

    const replies: Message[] = [];
    for (const [n, text] of input.replies.entries()) {
      replies.push(
        await tx.message.create({
          data: {
            userId: user.id,
            role: "friend",
            kind: "chat",
            text,
            clientId: replyClientId(message.clientId, n),
            // Keep replies strictly after the user message and in order.
            createdAt: new Date(Math.max(now.getTime(), message.createdAt.getTime()) + n + 1),
          },
        }),
      );
    }

    return { replies, items, memories };
  });
}

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
