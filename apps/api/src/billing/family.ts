import type { PrismaClient, User } from "../generated/prisma/client";
import { FAMILY_MAX_MEMBERS, hasActivePlan, hasPro } from "./plan";

/**
 * Family plan: Pro for up to 6 people, one payer. It covers the payer's family circles:
 * the payer plus the members who joined first, up to 6 people in each circle.
 */
export async function coveredByFamilyPlan(prisma: PrismaClient, userId: string, now: Date): Promise<boolean> {
  const circles = await prisma.circle.findMany({
    where: { kind: "family", members: { some: { userId } } },
    select: {
      members: {
        orderBy: [{ joinedAt: "asc" }, { role: "asc" }, { userId: "asc" }],
        select: { userId: true, user: { select: { plan: true, planExpiresAt: true, planTier: true } } },
      },
    },
  });
  for (const { members } of circles) {
    const payer = members.find((m) => m.userId !== userId && m.user.planTier === "family" && hasActivePlan(m.user, now));
    if (!payer) continue;
    // The payer always counts as one of the six.
    const covered = [payer.userId, ...members.filter((m) => m.userId !== payer.userId).map((m) => m.userId)].slice(0, FAMILY_MAX_MEMBERS);
    if (covered.includes(userId)) return true;
  }
  return false;
}

/** Pro through the user's own plan or invite days, or through a relative's Family plan. */
export async function hasProAccess(prisma: PrismaClient, user: User, now: Date): Promise<boolean> {
  return hasPro(user, now) || (await coveredByFamilyPlan(prisma, user.id, now));
}
