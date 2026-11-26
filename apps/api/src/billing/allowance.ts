import type { PrismaClient, User } from "../generated/prisma/client";
import { localToUtc, toLocalIso } from "../lib/time";
import { coveredByFamilyPlan } from "./family";
import { dailyAiAllowance } from "./plan";

/**
 * Today's AI messages for a one-off AI feature outside the chat (a receipt, homework help, an
 * answer check): the same count as chat (`ai_call` events with purpose "chat"), so each one
 * costs one message of the day. `limit` null = no cap (stores not set up, Pro, or a family plan).
 */
export async function aiAllowanceToday(prisma: PrismaClient, user: User, at: Date, requireSubscription: boolean | undefined): Promise<{ limit: number | null; used: number }> {
  let limit = requireSubscription ? dailyAiAllowance(user, at) : null;
  const dayStart = localToUtc(`${toLocalIso(at, user.timezone).slice(0, 10)}T00:00`, user.timezone);
  const [family, used] = await Promise.all([
    limit !== null ? coveredByFamilyPlan(prisma, user.id, at) : Promise.resolve(false),
    prisma.event.count({ where: { userId: user.id, name: "ai_call", createdAt: { gte: dayStart }, propsJson: { path: ["purpose"], equals: "chat" } } }),
  ]);
  if (family) limit = null;
  return { limit, used };
}
