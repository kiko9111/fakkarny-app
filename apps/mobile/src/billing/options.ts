/**
 * Which plan a store product is, read from its identifier (pure, so it can be unit-tested):
 * products are named like zaki_pro_monthly, zaki_pro_yearly, zaki_family_monthly,
 * zaki_family_yearly and zaki_founders_yearly. The server reads the same words
 * (apps/api/src/billing/plan.ts).
 */
export type PlanKind = "pro_monthly" | "pro_yearly" | "family_monthly" | "family_yearly" | "founders";

export function planKind(productId: string): PlanKind {
  if (/founder/i.test(productId)) return "founders";
  const yearly = /year|annual|12m|p1y/i.test(productId);
  if (/family/i.test(productId)) return yearly ? "family_yearly" : "family_monthly";
  return yearly ? "pro_yearly" : "pro_monthly";
}

const ORDER: PlanKind[] = ["founders", "pro_yearly", "pro_monthly", "family_yearly", "family_monthly"];

/** One option per plan kind, in display order; the founders' offer only while places remain. */
export function arrangeOptions<T extends { kind: PlanKind }>(options: T[], foundersLeft: number): T[] {
  const byKind = new Map<PlanKind, T>();
  for (const o of options) if (!byKind.has(o.kind)) byKind.set(o.kind, o);
  if (foundersLeft <= 0) byKind.delete("founders");
  return ORDER.flatMap((k) => byKind.get(k) ?? []);
}

export const isYearly = (kind: PlanKind) => kind === "pro_yearly" || kind === "family_yearly" || kind === "founders";
export const isFamily = (kind: PlanKind) => kind === "family_yearly" || kind === "family_monthly";
