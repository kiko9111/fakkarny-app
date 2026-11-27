import { currencyOf, MoneyKind, sectionKey, type MoneyEntry as WireEntry, type MoneySection as WireSection } from "@fakkarni/shared";
import { Prisma, type MoneyEntry, type MoneySection, type PrismaClient, type User } from "../generated/prisma/client";
import { postUpdate } from "../daftar/store";
import type { Notice } from "../proactive/notify";
import type { ReplyLang } from "../pipeline/rules";
import { randomUUID } from "node:crypto";
import { inBackground } from "../lib/background";
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

type MonthEntry = Pick<MoneyEntry, "userId" | "amount" | "split">;

export async function toWireSection(db: Db, s: SectionWithCircle, viewer: Pick<User, "id" | "timezone">, month: string, preloaded?: MonthEntry[]): Promise<WireSection> {
  const { from, to } = monthRange(month, viewer.timezone);
  const entries = preloaded ?? (await db.moneyEntry.findMany({ where: { sectionId: s.id, at: { gte: from, lt: to } }, select: { userId: true, amount: true, split: true } }));
  return wireSection(s, viewer, entries);
}

/** Every section in one query for the month's entries (was one query per section: ~0.1 s each in production). */
export async function toWireSections(db: Db, rows: SectionWithCircle[], viewer: Pick<User, "id" | "timezone">, month: string): Promise<WireSection[]> {
  if (!rows.length) return [];
  const { from, to } = monthRange(month, viewer.timezone);
  const all = await db.moneyEntry.findMany({ where: { sectionId: { in: rows.map((s) => s.id) }, at: { gte: from, lt: to } }, select: { sectionId: true, userId: true, amount: true, split: true } });
  const by = new Map<string, MonthEntry[]>();
  for (const e of all) by.set(e.sectionId, [...(by.get(e.sectionId) ?? []), e]);
  return rows.map((s) => wireSection(s, viewer, by.get(s.id) ?? []));
}

/** The user's own section with the same name and kind (case and spacing ignored), if any. */
export function sameSection<T extends Pick<MoneySection, "name" | "kind" | "circleId" | "ownerId">>(rows: T[], ownerId: string, name: string, kind: string, circleId: string | null): T | null {
  const key = sectionKey(name);
  return rows.find((s) => (s.circleId ?? null) === circleId && s.kind === kind && sectionKey(s.name) === key && (circleId !== null || s.ownerId === ownerId)) ?? null;
}

/**
 * Old duplicates ("salary" and "Salary", made before the server refused them): the user's own
 * personal sections with the same name and kind are merged into the oldest one (entries moved,
 * the larger budget kept). Returns the rows left. Shared books are never merged.
 */
export async function mergeDuplicateSections<T extends SectionWithCircle>(prisma: PrismaClient, ownerId: string, rows: T[]): Promise<T[]> {
  const keep = new Map<string, T>();
  const gone: { from: T; into: T }[] = [];
  for (const s of rows) {
    if (s.circleId || s.ownerId !== ownerId) continue;
    const k = `${s.kind}|${sectionKey(s.name)}`;
    const first = keep.get(k);
    if (!first) keep.set(k, s);
    else gone.push({ from: s, into: first });
  }
  if (!gone.length) return rows;
  await prisma.$transaction(async (tx) => {
    for (const { from, into } of gone) {
      await tx.moneyEntry.updateMany({ where: { sectionId: from.id }, data: { sectionId: into.id } });
      if (from.budget !== null && (into.budget === null || Number(from.budget) > Number(into.budget))) {
        await tx.moneySection.update({ where: { id: into.id }, data: { budget: from.budget } });
        into.budget = from.budget;
      }
      await tx.moneySection.delete({ where: { id: from.id } });
    }
  });
  const removed = new Set(gone.map((g) => g.from.id));
  return rows.filter((s) => !removed.has(s.id));
}

function wireSection(s: SectionWithCircle, viewer: Pick<User, "id">, entries: MonthEntry[]): WireSection {
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
  /** The same id was added before: nothing new happened. */
  replay?: boolean;
}

/**
 * Add an amount. Near or over a monthly budget, Zaki tells the person who logged it (once per
 * level per month). In a shared book the other members hear about it in their chat with a push,
 * and Zaki posts it in the circle feed.
 */
/** An add without an id that repeats one from the last 2 minutes is a retry (see addEntry). */
export const APP_RETRY_WINDOW_MS = 2 * 60_000;

export async function addEntry(
  prisma: PrismaClient,
  section: SectionWithCircle,
  user: Pick<User, "id" | "name" | "timezone" | "language">,
  input: { id?: string; amount: number; note: string | null; split?: string[]; source: "app" | "chat" },
  now: Date,
): Promise<Added> {
  // A retried add from the phone (same id) is the same entry, never a second one.
  if (input.id) {
    const had = await prisma.moneyEntry.findUnique({ where: { id: input.id } });
    if (had) {
      if (had.sectionId !== section.id || had.userId !== user.id) throw new Error("money entry id in use");
      return { entry: had, monthTotal: 0, notices: [], replay: true };
    }
  } else if (input.source === "app") {
    // App builds from before 2026-11-25 send no id and gave up after 20 s on a slow server while
    // the add still went through, so a second tap saved it twice. The same amount and note in the
    // same section from the same person within 2 minutes is that retry, not a new entry.
    const had = await prisma.moneyEntry.findFirst({
      where: { sectionId: section.id, userId: user.id, amount: new Prisma.Decimal(input.amount), note: input.note, source: "app", at: { gte: new Date(now.getTime() - APP_RETRY_WINDOW_MS) } },
      orderBy: { at: "desc" },
    });
    if (had) return { entry: had, monthTotal: 0, notices: [], replay: true };
  }
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
      data: { ...(input.id ? { id: input.id } : {}), sectionId: section.id, userId: user.id, amount: new Prisma.Decimal(input.amount), note: input.note, split, source: input.source, at: now },
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
  // Both lookups at once: where this note went last time doesn't depend on the list of sections.
  const [rows, last] = await Promise.all([
    prisma.moneySection.findMany({ where: visibleTo(user.id), include: { circle: { select: { name: true } } }, orderBy: { createdAt: "asc" }, take: 200 }),
    hit.note ? prisma.moneyEntry.findFirst({ where: { userId: user.id, note: hit.note, section: visibleTo(user.id) }, orderBy: { at: "desc" }, select: { sectionId: true } }) : null,
  ]);
  const own = rows.filter((s) => !s.circleId);
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
  inBackground(prisma.event.create({ data: { userId: user.id, name: "money_logged", propsJson: { via: "chat", shared: Boolean(section.circleId) } } }));
  // A done card with Undo, so "تراجع" (or the button) takes it back like any other chat change.
  const card: StoredCard = {
    id: randomUUID(),
    kind: "log_money",
    status: "done",
    label: LABEL.moneyLogged(lang, hit.kind, hit.amount, section.name, added.monthTotal),
    route: `/money/${section.id}`,
    lang,
    undo: { kind: "money_entry", entryId: added.entry.id },
  };
  return { text: loggedMoneyLine(lang, section.name, hit.amount, added.monthTotal, hit.kind, currencyOf(user.city)), notices: added.notices, cards: [card] };
}
