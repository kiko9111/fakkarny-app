import type { FastifyBaseLogger } from "fastify";
import type { PrismaClient } from "../generated/prisma/client";
import type { PushSender } from "./push";

export interface Notice {
  userId: string;
  text: string;
}

/**
 * Free push for a line Zaki already put in someone's chat. Best effort: the message is in
 * the chat either way, so a failed push is only logged (by error name, never the text).
 */
export async function pushNotices(prisma: PrismaClient, push: PushSender | undefined, notices: Notice[], log?: FastifyBaseLogger): Promise<void> {
  if (!push || notices.length === 0) return;
  try {
    const devices = await prisma.device.findMany({ where: { userId: { in: notices.map((n) => n.userId) }, pushToken: { not: null } } });
    if (devices.length === 0) return;
    const textFor = new Map(notices.map((n) => [n.userId, n.text]));
    const result = await push(devices.map((d) => ({ to: d.pushToken!, title: "Zaki", body: textFor.get(d.userId)!, sound: "default" as const, data: { type: "message", kind: "update" } })));
    if (result.invalidTokens.length) await prisma.device.updateMany({ where: { pushToken: { in: result.invalidTokens } }, data: { pushToken: null } });
  } catch (err) {
    log?.warn({ err: (err as Error).name }, "push failed");
  }
}
