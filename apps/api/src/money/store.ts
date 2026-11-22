import { MoneyKind, type MoneyEntry as WireEntry, type MoneySection as WireSection } from "@fakkarni/shared";
import { Prisma, type MoneyEntry, type MoneySection, type PrismaClient, type User } from "../generated/prisma/client";
import { postUpdate } from "../daftar/store";
import type { Notice } from "../proactive/notify";
import type { ReplyLang } from "../pipeline/rules";
import { randomUUID } from "node:crypto";
import { LABEL, type StoredCard } from "../chat/cards";
import { budgetCrossed, budgetLine, loggedMoneyLine, matchMoneyLog, monthOf, monthRange, pickSection, shareOf } from "./rules";

type Db = PrismaClient | Prisma.TransactionClient;
export type SectionWithCircle = MoneySection & { circle: { name: string } | null };

/** Sections this user can see: their own, plus the shared books of circles they are in. */
export const visibleTo = (userId: string): Prisma.MoneySectionWhereInput => ({
  OR: [{ ownerId: userId, circleId: null }, { circle: { members: { some: { userId } } } }],
});

export const langFor = (u: Pick<User, "language">): ReplyLang => (u.language === "en" ? "english" : "arabic");

const toSplit = (e: Pick<MoneyEntry, "userId" | "amount" | "split">) => ({ payerId: e.userId, amount: Number(e.amount), split: e.split });

export async function toWireSection(db: Db, s: SectionWithCircle, viewer: Pick<User, "id" | "timezone">, month: string): Promise<WireSection> {
  const { from, to } = monthRange(month, viewer.timezone);
  const entries = await db.moneyEntry.findMany({ where: { sectionId: s.id, at: { gte: from, lt: to } }, select: { userId: true, amount: true, split: true } });
  const total = entries.reduce((n, e) => n + Number(e.amount), 0);
  return {
    id: s.id,
    name: s.name,
    kind: MoneyKind.catch("expense").parse(s.kind),
    budget: s.budget === null ? null : Number(s.budget),
    circle_id: s.circleId,
    circle_name: s.circle?.name ?? null,
    is_owner: s.ownerId === viewer.id,
    month_total: Math.round(total * 100) / 100,
    my_share: s.circleId ? shareOf(entries.map(toSplit), viewer.id) : Math.round(total * 100) / 100,
    created_at: s.createdAt.toISOString(),
  };
}

export function toWireEntry(e: MoneyEntry & { user: { name: string | null } }, viewerId: string): WireEntry {
  return {
    id: e.id,
    section_id: e.sectionId,
    amount: Number(e.amount),
    note: e.note,
    at: e.at.toISOString(),
    payer_name: e.user.name,
    is_mine: e.userId === viewerId,
    split_count: Math.max(1, e.split.length),
  };
}

export interface Added {
  entry: MoneyEntry;
  monthTotal: number;
  notices: Notice[];
}

/**
 * Add an amount. Near or over a monthly budget, Zaki tells the person who logged it (once per
 * level per month). In a shared book the other members hear about it in their chat with a push,
 * and Zaki posts it in the circle feed.
 */
export async function addEntry(
  prisma: PrismaClient,
  section: SectionWithCircle,
  user: Pick<User, "id" | "name" | "timezone" | "language">,
  input: { amount: number; note: string | null; split?: string[]; source: "app" | "chat" },
  now: Date,
): Promise<Added> {
  return prisma.$transaction(async (tx) => {
    const month = monthOf(now, user.timezone);
    const { from, to } = monthRange(month, user.timezone);
    const before = Number((await tx.moneyEntry.aggregate({ where: { sectionId: section.id, at: { gte: from, lt: to } }, _sum: { amount: true } }))._sum.amount ?? 0);
    let split: string[] = [];
    if (section.circleId) {
      const members = (await tx.circleMember.findMany({ where: { circleId: section.circleId }, select: { userId: true } })).map((m) => m.userId);
      split = input.split?.length ? [...new Set(input.split)].filter((id) => members.includes(id)) : members;
      if (!split.length) split = members;
    }
    const entry = await tx.moneyEntry.create({
      data: { sectionId: section.id, userId: user.id, amount: new Prisma.Decimal(input.amount), note: input.note, split, source: input.source, at: now },
    });
    const after = before + input.amount;
    const notices: Notice[] = [];
    const budget = section.budget === null ? null : Number(section.budget);
    const level = section.kind === "expense" ? budgetCrossed(before, after, budget) : null;
    if (level && budget) {
      // The logger, and the owner of a shared book if that is someone else.
      const readers = await tx.user.findMany({ where: { id: { in: [...new Set([user.id, section.ownerId])] } }, select: { id: true, language: true } });
      for (const r of readers) {
        const text = budgetLine(langFor(r), section.name, after, budget, level);
        await postUpdate(tx, r.id, `budget:${section.id}:${month}:${level}`, text, now);
        notices.push({ userId: r.id, text });
      }
    }
    if (section.circleId) {
      await tx.circlePost.create({ data: { circleId: section.circleId, event: "book_entry", actorId: user.id, title: `${section.name}|${input.amount}`, createdAt: now } });
      const others = await tx.user.findMany({ where: { id: { in: split.filter((id) => id !== user.id) } }, select: { id: true, language: true } });
      for (const o of others) {
        const share = Math.round((input.amount / split.length) * 100) / 100;
        const text = bookLine(langFor(o), user.name, section.name, input.amount, share);
        await postUpdate(tx, o.id, `book:${entry.id}`, text, now);
        notices.push({ userId: o.id, text });
      }
    }
    return { entry, monthTotal: Math.round(after * 100) / 100, notices };
  });
}

const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const nameOr = (n: string | null, lang: ReplyLang) => n ?? (lang === "english" ? "Someone" : "حد");

/** What the other members of a shared book hear. No gendered verbs in Arabic. */
export function bookLine(lang: ReplyLang, payer: string | null, book: string, amount: number, share: number): string {
  const who = nameOr(payer, lang);
  return lang === "english"
    ? `${who} added EGP ${num(amount)} to “${book}”. Your share: ${num(share)}.`
    : `${who}: ${num(amount)} جنيه في «${book}». نصيبك ${num(share)}.`;
}

const SHARED_ASK: Record<ReplyLang, string> = {
  arabic: "دي في الدفتر المشترك، أضيفها؟ كل اللي فيه هيشوفوها.",
  english: "That one goes in a shared book. Add it? Everyone in it will see it.",
};

export const CATCH_ALL: Record<"expense" | "income", Record<ReplyLang, string>> = {
  expense: { arabic: "مصاريف", english: "Expenses" },
  income: { arabic: "دخل", english: "Income" },
};

/**
 * The chat side: "دفعت 300 بنزين" logs to the right section by rules (no AI call). The section
 * is the one named in the message, else where this note went last time, else the only one of
 * that kind, else a catch-all the user can rename. Shared books are only picked by name.
 */
export async function moneyFastPath(prisma: PrismaClient, user: User, text: string, lang: ReplyLang, now: Date): Promise<{ text: string; notices: Notice[]; cards?: StoredCard[] } | null> {
  const hit = matchMoneyLog(text);
  if (!hit) return null;
  const rows = await prisma.moneySection.findMany({ where: visibleTo(user.id), include: { circle: { select: { name: true } } }, orderBy: { createdAt: "asc" }, take: 200 });
  const own = rows.filter((s) => !s.circleId);
  const last = hit.note
    ? await prisma.moneyEntry.findFirst({ where: { userId: user.id, note: hit.note, section: visibleTo(user.id) }, orderBy: { at: "desc" }, select: { sectionId: true } })
    : null;
  const byName = pickSection(rows, hit, text, null);
  const picked = (byName && rows.find((s) => s.id === byName.id)) || rows.find((s) => s.id === pickSection(own, hit, text, last?.sectionId ?? null)?.id);
  const name = CATCH_ALL[hit.kind][lang];
  const section =
    picked ??
    own.find((s) => s.kind === hit.kind && (s.name === CATCH_ALL[hit.kind].arabic || s.name === CATCH_ALL[hit.kind].english)) ??
    (await prisma.moneySection.create({ data: { ownerId: user.id, name, kind: hit.kind, createdAt: now }, include: { circle: { select: { name: true } } } }));
  if (section.circleId) {
    // A shared book tells everyone in it: Zaki asks first (a card with Add / Cancel).
    const card: StoredCard = {
      id: randomUUID(),
      kind: "log_money",
      status: "pending",
      label: LABEL.moneyAsk(lang, hit.amount, section.name, section.circle?.name ?? null),
      route: `/money/${section.id}`,
      lang,
      payload: { kind: "log_money", sectionId: section.id, amount: hit.amount, note: hit.note, moneyKind: hit.kind },
    };
    return { text: SHARED_ASK[lang], notices: [], cards: [card] };
  }
  const added = await addEntry(prisma, section, user, { amount: hit.amount, note: hit.note, source: "chat" }, now);
  await prisma.event.create({ data: { userId: user.id, name: "money_logged", propsJson: { via: "chat", shared: Boolean(section.circleId) } } });
  return { text: loggedMoneyLine(lang, section.name, hit.amount, added.monthTotal, hit.kind), notices: added.notices };
}
