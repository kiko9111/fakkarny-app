import type { PrismaClient } from "../generated/prisma/client";
import type { PushSender, ReceiptChecker } from "./push";

/** Receipts are ready about 15 minutes after sending and kept by Expo for a day. */
export const RECEIPT_AFTER_MS = 15 * 60_000;
const RECEIPT_KEEP_MS = 24 * 3600_000;

/**
 * Wraps the push sender used everywhere (tick, check-ins, tasks, feed): clears tokens Expo
 * rejects straight away and keeps the ticket ids so `checkPushReceipts` can clear the ones
 * rejected later. Bookkeeping errors never fail a push.
 */
export function trackPush(prisma: PrismaClient, send: PushSender): PushSender {
  return async (messages) => {
    const result = await send(messages);
    try {
      if (result.invalidTokens.length) await prisma.device.updateMany({ where: { pushToken: { in: result.invalidTokens } }, data: { pushToken: null } });
      if (result.tickets?.length) await prisma.pushTicket.createMany({ data: result.tickets, skipDuplicates: true });
    } catch {
      // Best effort.
    }
    return result;
  };
}

/** Housekeeping job: read receipts that are ready, clear dead tokens, drop checked tickets. */
export async function checkPushReceipts(prisma: PrismaClient, check: ReceiptChecker, now = new Date()): Promise<number> {
  await prisma.pushTicket.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - RECEIPT_KEEP_MS) } } });
  let cleared = 0;
  for (;;) {
    const tickets = await prisma.pushTicket.findMany({ where: { createdAt: { lte: new Date(now.getTime() - RECEIPT_AFTER_MS) } }, orderBy: { createdAt: "asc" }, take: 1000 });
    if (!tickets.length) break;
    const dead = new Set(await check(tickets.map((t) => t.id)));
    const tokens = tickets.filter((t) => dead.has(t.id)).map((t) => t.token);
    if (tokens.length) cleared += (await prisma.device.updateMany({ where: { pushToken: { in: tokens } }, data: { pushToken: null } })).count;
    await prisma.pushTicket.deleteMany({ where: { id: { in: tickets.map((t) => t.id) } } });
    if (tickets.length < 1000) break;
  }
  return cleared;
}
