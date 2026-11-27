import type { User } from "@fakkarni/shared";

/**
 * What the Me tab says about the person without opening a page: the plan under the name and the
 * value line of each row. Pure: the words come in as `words`, dates through `date`.
 */

export type PlanKind = "free" | "pro" | "family";
export interface PlanNow {
  kind: PlanKind;
  /** When Pro ends by itself (invite days, a trial). A paid plan renews, so it has none. */
  until: string | null;
}

type PlanFields = Pick<User, "pro" | "plan" | "plan_tier" | "plan_expires_at" | "bonus_pro_until">;

export function planNow(user: PlanFields | null, now: Date): PlanNow {
  if (!user?.pro) return { kind: "free", until: null };
  const paid = user.plan === "monthly" || user.plan === "yearly";
  if (paid) return { kind: user.plan_tier === "family" ? "family" : "pro", until: null };
  const ends = [user.bonus_pro_until, user.plan === "trial" ? user.plan_expires_at : null]
    .filter((d): d is string => !!d && new Date(d).getTime() > now.getTime())
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  // Pro with no plan and no days of their own: covered by someone's Family plan. No date to show.
  return { kind: "pro", until: ends[0] ?? null };
}

export interface PlanWords {
  planFree: string;
  planPro: string;
  planFamily: string;
  /** "{plan} until {date}" */
  planUntil: string;
}

export function planLine(plan: PlanNow, words: PlanWords, date: (iso: string) => string): string {
  const name = plan.kind === "free" ? words.planFree : plan.kind === "family" ? words.planFamily : words.planPro;
  return plan.until ? words.planUntil.replace("{plan}", name).replace("{date}", date(plan.until)) : name;
}

/** "{n} alarms" with its own word for one; nothing for none. */
export function countLine(n: number, one: string, many: string): string | null {
  if (n <= 0) return null;
  return n === 1 ? one : many.replace("{n}", String(n));
}

/** The parts that have something to say, joined the way row values are ("a · b"). */
export const joinLine = (parts: (string | null | undefined)[]): string | undefined => parts.filter(Boolean).join(" · ") || undefined;
