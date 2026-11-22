import type { PrismaClient, User } from "../generated/prisma/client";
import { FAMILY_MAX_MEMBERS, hasActivePlan, hasPro } from "./plan";

/**
 * Family plan: Pro for up to 6 people, one payer. Coverage is counted per payer, across all
 * of the payer's family circles: the payer plus the first 5 other people by the time they
 * joined one of them. (Counting per circle would let one payer cover 6 people in each of
 * up to 100 circles.)
 */
export async function coveredByFamilyPlan(prisma: PrismaClient, userId: string, now: Date): Promise<boolean> {
  // Family-plan payers who share a family circle with this user.
  const payers = await prisma.user.findMany({
    where: { id: { not: userId }, planTier: "family", circles: { some: { circle: { kind: "family", members: { some: { userId } } } } } },
    select: { id: true, plan: true, planExpiresAt: true, planTier: true },
  });
  for (const payer of payers) {
    if (!hasActivePlan(payer, now)) continue;
    const members = await prisma.circleMember.findMany({
      where: { userId: { not: payer.id }, circle: { kind: "family", members: { some: { userId: payer.id } } } },
      orderBy: [{ joinedAt: "asc" }, { userId: "asc" }],
      select: { userId: true },
    });
    const covered = [...new Set(members.map((m) => m.userId))].slice(0, FAMILY_MAX_MEMBERS - 1);
    if (covered.includes(userId)) return true;
  }
  return false;
}

/** Pro through the user's own plan or invite days, or through a relative's Family plan. */
export async function hasProAccess(prisma: PrismaClient, user: User, now: Date): Promise<boolean> {
  return hasPro(user, now) || (await coveredByFamilyPlan(prisma, user.id, now));
}
