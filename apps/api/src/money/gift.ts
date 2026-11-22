import type { MonthGift } from "@fakkarni/shared";
import type { PrismaClient, User } from "../generated/prisma/client";
import { giftLines, monthOf, previousMonth } from "./rules";
import { langFor, toWireSection, visibleTo } from "./store";

/** The numbers behind Zaki's end-of-month gift: the caller's own money (their share of shared books). */
export async function monthGift(prisma: PrismaClient, user: User, now: Date, month?: string): Promise<MonthGift> {
  const m = month ?? previousMonth(monthOf(now, user.timezone));
  const rows = await prisma.moneySection.findMany({ where: visibleTo(user.id), include: { circle: { select: { name: true } } }, take: 200 });
  const [cur, prev] = await Promise.all([Promise.all(rows.map((s) => toWireSection(prisma, s, user, m))), Promise.all(rows.map((s) => toWireSection(prisma, s, user, previousMonth(m))))]);
  const sum = (list: typeof cur, kind: string) => Math.round(list.filter((s) => s.kind === kind).reduce((n, s) => n + s.my_share, 0) * 100) / 100;
  const expense = sum(cur, "expense");
  const income = sum(cur, "income");
  const previousExpense = sum(prev, "expense") || null;
  const sections = cur.filter((s) => s.kind === "expense").map((s) => ({ name: s.name, total: s.circle_id ? s.my_share : s.month_total, budget: s.circle_id ? null : s.budget }));
  return { month: m, expense, income, lines: expense || income ? giftLines(langFor(user), { month: m, expense, income, sections, previousExpense }) : [] };
}
