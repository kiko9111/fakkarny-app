import { randomUUID } from "node:crypto";
import { MAX_SECTIONS, TRACKER_TEMPLATES, type AppAction, type TrackerKind } from "@fakkarni/shared";
import { Prisma, type PrismaClient, type Split, type Tracker, type User } from "../generated/prisma/client";
import { askZaki } from "../circles/ask";
import { MAX_CIRCLES_PER_USER } from "../circles/rules";
import { safeLocalToUtc } from "../pipeline/apply";
import type { ReplyLang } from "../pipeline/rules";
import type { Notice } from "../proactive/notify";
import { addEntry, CATCH_ALL, sameSection, visibleTo, type SectionWithCircle } from "../money/store";
import { monthOf, monthRange } from "../money/rules";
import { assignTask, withPeople as taskPeople, type TaskWithPeople } from "../tasks/store";
import { withPeople as daftarPeople, type EntryWithPeople } from "../daftar/store";
import { trackerLabel } from "../trackers/labels";
import { createTracker, logEntry, toWireTracker } from "../trackers/store";
import { LABEL, matchByName, storedCards, type PendingPayload, type StoredCard, type UndoPayload } from "./cards";
import { planDaftar, runMore, runMorePending } from "./more-actions";

/** What the user has in the app, for resolving names (and for the model's context). */
export interface AppData {
  circles: { id: string; name: string; kind: string; createdAt: Date; members: { userId: string; name: string | null }[] }[];
  sections: SectionWithCircle[];
  trackers: (Tracker & { circle: { name: string } | null })[];
  /** The numbers (loaded for the model's context; absent in evals and name-only loads). */
  numbers?: AppNumbers;
}

/** "Give Zaki the numbers": so "how much did I spend on food?" needs no extra call. */
export interface AppNumbers {
  /** This month's total per section id (a shared book: everyone's entries). */
  monthSpend: Record<string, number>;
  /** Today and the streak per tracker id. */
  trackerStats: Record<string, { today: number; streak: number }>;
  tasks: TaskWithPeople[];
  daftar: EntryWithPeople[];
  splits: Split[];
}

const NUMBERS_TRACKERS = 12;

/** The numbers block: month totals, tracker streaks, open tasks, Daftar entries and recent splits. */
export async function loadAppNumbers(prisma: PrismaClient, user: Pick<User, "id" | "timezone">, data: AppData, now: Date): Promise<AppNumbers> {
  const { from, to } = monthRange(monthOf(now, user.timezone), user.timezone);
  const [spend, tasks, daftar, splits, stats] = await Promise.all([
    data.sections.length
      ? prisma.moneyEntry.groupBy({ by: ["sectionId"], where: { sectionId: { in: data.sections.map((s) => s.id) }, at: { gte: from, lt: to } }, _sum: { amount: true } })
      : Promise.resolve([]),
    prisma.circleTask.findMany({
      where: {
        OR: [
          { assigneeId: user.id, status: { in: ["pending", "accepted"] } },
          { assignerId: user.id, status: { in: ["pending", "accepted"] } },
          { assignerId: user.id, status: "done", homework: true, submittedAt: { not: null }, review: null },
        ],
      },
      include: taskPeople,
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.daftarEntry.findMany({
      where: { status: { in: ["pending", "confirmed", "disputed"] }, OR: [{ creatorId: user.id }, { otherUserId: user.id }] },
      include: daftarPeople,
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.split.findMany({ where: { userId: user.id, createdAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } }, orderBy: { createdAt: "desc" }, take: 5 }),
    Promise.all(data.trackers.slice(0, NUMBERS_TRACKERS).map(async (t) => [t.id, await toWireTracker(prisma, t, user.timezone, now)] as const)),
  ]);
  return {
    monthSpend: Object.fromEntries(spend.map((g) => [g.sectionId, Math.round(Number(g._sum.amount ?? 0) * 100) / 100])),
    trackerStats: Object.fromEntries(stats.map(([id, w]) => [id, { today: w.today, streak: w.streak }])),
    tasks,
    daftar,
    splits,
  };
}

export async function loadAppData(prisma: PrismaClient, userId: string): Promise<AppData> {
  const [circles, sections, trackers] = await Promise.all([
    prisma.circle.findMany({
      where: { members: { some: { userId } } },
      include: { members: { include: { user: { select: { name: true } } }, orderBy: { joinedAt: "asc" } } },
      orderBy: { createdAt: "asc" },
      take: 30,
    }),
    prisma.moneySection.findMany({ where: visibleTo(userId), include: { circle: { select: { name: true } } }, orderBy: { createdAt: "asc" }, take: 60 }),
    prisma.tracker.findMany({ where: { userId }, include: { circle: { select: { name: true } } }, orderBy: { createdAt: "asc" }, take: 40 }),
  ]);
  return {
    circles: circles.map((c) => ({ id: c.id, name: c.name, kind: c.kind, createdAt: c.createdAt, members: c.members.map((m) => ({ userId: m.userId, name: m.user.name })) })),
    sections,
    trackers,
  };
}

/**
 * A debt the user mentioned with someone in their circles ("Mona owes me 200") is also offered
 * for the shared Daftar, where Mona sees and confirms it: a waiting card, never sent on its own.
 * Debts with anyone else stay private items.
 */
export async function debtCards(prisma: PrismaClient, user: User, debts: { person: string; amount: number; direction: "owed_to_me" | "i_owe" }[], lang: ReplyLang, data?: AppData): Promise<StoredCard[]> {
  if (!debts.length) return [];
  const ctx = { user, data: data ?? (await loadAppData(prisma, user.id)) };
  if (!ctx.data.circles.some((c) => c.members.length > 1)) return [];
  const out: StoredCard[] = [];
  for (const d of debts.slice(0, 2)) {
    if (!(d.amount > 0)) continue;
    const plan = planDaftar(ctx, d.person, d.direction, d.amount, null);
    if (plan.member) out.push(card(lang, "daftar_add", "pending", LABEL.daftarAsk(lang, plan.payload.otherName, d.amount, d.direction, true), "/money", plan.payload));
  }
  return out;
}

export interface ActionsResult {
  cards: StoredCard[];
  notices: Notice[];
}

export interface Ctx {
  prisma: PrismaClient;
  user: User;
  lang: ReplyLang;
  now: Date;
  data: AppData;
  requireSubscription: boolean;
}

export const card = (lang: ReplyLang, kind: string, status: StoredCard["status"], label: string, route: string | null = null, payload?: PendingPayload, undo?: UndoPayload): StoredCard => ({
  id: randomUUID(),
  kind,
  status,
  label,
  route,
  lang,
  ...(payload ? { payload } : {}),
  ...(undo && status === "done" ? { undo } : {}),
});

export const kindOf = (t: Tracker): TrackerKind => (t.kind in TRACKER_TEMPLATES ? (t.kind as TrackerKind) : "custom");

/**
 * Run the model's app actions for this user. Their own things happen now; anything that
 * messages other people becomes a pending card for the user's OK. Never throws on bad model
 * output: an action that can't be done becomes a "failed" card that says why.
 */
export async function runAppActions(prisma: PrismaClient, user: User, actions: AppAction[], lang: ReplyLang, now: Date, opts: { requireSubscription?: boolean } = {}): Promise<ActionsResult> {
  if (!actions.length) return { cards: [], notices: [] };
  const ctx: Ctx = { prisma, user, lang, now, data: await loadAppData(prisma, user.id), requireSubscription: opts.requireSubscription ?? false };
  const cards: StoredCard[] = [];
  const notices: Notice[] = [];
  for (const a of actions) {
    try {
      const out = await runOne(ctx, a);
      cards.push(out.card);
      notices.push(...(out.notices ?? []));
      // Later actions in the same turn see what earlier ones made ("make a Car section, log 300 in it").
      if (out.refresh) ctx.data = await loadAppData(prisma, user.id);
    } catch {
      cards.push(card(lang, a.kind, "failed", LABEL.failed(lang)));
    }
  }
  await prisma.event.create({ data: { userId: user.id, name: "chat_actions", propsJson: { kinds: actions.map((a) => a.kind), statuses: cards.map((c) => c.status) } } });
  return { cards, notices: notices.filter((n) => n.userId !== user.id) };
}

export type One = { card: StoredCard; notices?: Notice[]; refresh?: boolean };

async function runOne(ctx: Ctx, a: AppAction): Promise<One> {
  const { lang } = ctx;
  switch (a.kind) {
    case "log_money":
      return logMoney(ctx, a);
    case "create_section":
      return createSection(ctx, a);
    case "set_budget": {
      const s = matchByName(ctx.data.sections, a.section ?? a.name, (x) => [x.name]);
      if (!s) return { card: card(lang, a.kind, "failed", LABEL.notFound(lang, "section", a.section ?? a.name)) };
      if (s.ownerId !== ctx.user.id) return { card: card(lang, a.kind, "failed", LABEL.ownerOnly(lang, s.name), `/money/${s.id}`) };
      const budget = a.amount ?? null;
      await ctx.prisma.moneySection.update({ where: { id: s.id }, data: { budget: budget === null ? null : new Prisma.Decimal(budget) } });
      return { card: card(lang, a.kind, "done", LABEL.budgetSet(lang, s.name, budget), `/money/${s.id}`, undefined, { kind: "budget", sectionId: s.id, budget: s.budget === null ? null : Number(s.budget) }), refresh: true };
    }
    case "create_tracker":
      return makeTracker(ctx, a);
    case "log_tracker": {
      const t = findTracker(ctx, a.tracker ?? a.name, a.tracker_kind);
      if (!t) return { card: card(lang, a.kind, "failed", LABEL.notFound(lang, "tracker", a.tracker ?? a.name), "/trackers") };
      const step = a.amount ?? (TRACKER_TEMPLATES[kindOf(t)].step || 1);
      const entry = await logEntry(ctx.prisma, t, step, "chat", ctx.now, ctx.user.timezone);
      const w = await toWireTracker(ctx.prisma, t, ctx.user.timezone, ctx.now);
      return { card: card(lang, a.kind, "done", LABEL.trackerLogged(lang, trackerLabel(w.kind, w.name, lang), w.today, w.goal), "/trackers", undefined, { kind: "tracker_entry", entryId: entry.id }) };
    }
    case "update_tracker": {
      const t = findTracker(ctx, a.tracker ?? a.name, a.tracker_kind);
      if (!t) return { card: card(lang, a.kind, "failed", LABEL.notFound(lang, "tracker", a.tracker ?? a.name), "/trackers") };
      const askTimes = a.ask_times ? [...new Set(a.ask_times)].sort() : null;
      const goal = a.amount ?? null;
      await ctx.prisma.tracker.update({ where: { id: t.id }, data: { ...(askTimes ? { askTimes } : {}), ...(goal ? { goal: new Prisma.Decimal(goal) } : {}) } });
      const before: UndoPayload = { kind: "tracker_settings", trackerId: t.id, goal: t.goal === null ? null : Number(t.goal), askTimes: t.askTimes };
      return { card: card(lang, a.kind, "done", LABEL.trackerUpdated(lang, trackerLabel(kindOf(t), t.name, lang), askTimes, goal), "/trackers", undefined, before), refresh: true };
    }
    case "create_circle":
      return makeCircle(ctx, a);
    case "assign_task":
      return planTask(ctx, a);
    case "ask_circle": {
      const c = pickCircle(ctx, a.circle);
      if (!c) return { card: card(lang, a.kind, "failed", a.circle ? LABEL.notFound(lang, "circle", a.circle) : LABEL.notFound(lang, "which_circle"), "/circles") };
      const text = a.text ?? a.title ?? a.name;
      if (!text) return { card: card(lang, a.kind, "failed", LABEL.failed(lang)) };
      return { card: card(lang, a.kind, "pending", LABEL.circleAsk(lang, c.name, text), `/circle/${c.id}`, { kind: "ask_circle", circleId: c.id, text }) };
    }
    default:
      return runMore(ctx, a);
  }
}

export function findTracker(ctx: Ctx, name: string | undefined, kind: TrackerKind | undefined): AppData["trackers"][number] | null {
  const byName = matchByName(ctx.data.trackers, name, (t) => [t.name, trackerLabel(kindOf(t), null, "arabic").replace(/\s*\S+$/u, ""), trackerLabel(kindOf(t), null, "english").replace(/\s*\S+$/u, ""), t.kind]);
  if (byName) return byName;
  if (kind && kind !== "custom") {
    const same = ctx.data.trackers.filter((t) => t.kind === kind);
    if (same.length === 1) return same[0]!;
  }
  return ctx.data.trackers.length === 1 && !name && !kind ? ctx.data.trackers[0]! : null;
}

/** The named circle, or the only one when none is named. */
export function pickCircle(ctx: Ctx, name: string | undefined): AppData["circles"][number] | null {
  if (name) return matchByName(ctx.data.circles, name, (c) => [c.name]);
  return ctx.data.circles.length === 1 ? ctx.data.circles[0]! : null;
}

async function logMoney(ctx: Ctx, a: AppAction): Promise<One> {
  const { lang, prisma, user } = ctx;
  const amount = a.amount;
  if (!amount) return { card: card(lang, a.kind, "failed", LABEL.failed(lang)) };
  const kind = a.money_kind ?? "expense";
  let section: SectionWithCircle | null = a.section ? matchByName(ctx.data.sections, a.section, (s) => [s.name]) : null;
  let refresh = false;
  if (!section) {
    const own = ctx.data.sections.filter((s) => !s.circleId);
    const wanted = a.section?.trim();
    // A section they named that does not exist yet is made; otherwise the catch-all for that kind.
    section =
      (wanted ? sameSection(own, user.id, wanted, kind, null) : own.find((s) => s.kind === kind && (s.name === CATCH_ALL[kind].arabic || s.name === CATCH_ALL[kind].english))) ??
      (await prisma.moneySection.create({ data: { ownerId: user.id, name: wanted || CATCH_ALL[kind][lang], kind, createdAt: ctx.now }, include: { circle: { select: { name: true } } } }));
    refresh = true;
  }
  const note = a.note ?? null;
  if (section.circleId) {
    return { card: card(lang, a.kind, "pending", LABEL.moneyAsk(lang, amount, section.name, section.circle?.name ?? null), `/money/${section.id}`, { kind: "log_money", sectionId: section.id, amount, note, moneyKind: kind }) };
  }
  const added = await addEntry(prisma, section, user, { amount, note, source: "chat" }, ctx.now);
  await prisma.event.create({ data: { userId: user.id, name: "money_logged", propsJson: { via: "chat_ai", shared: false } } });
  return { card: card(lang, a.kind, "done", LABEL.moneyLogged(lang, kind, amount, section.name, added.monthTotal), `/money/${section.id}`, undefined, { kind: "money_entry", entryId: added.entry.id }), notices: added.notices, refresh };
}

async function createSection(ctx: Ctx, a: AppAction): Promise<One> {
  const { lang, prisma, user } = ctx;
  const name = (a.name ?? a.section)?.slice(0, 40);
  if (!name) return { card: card(lang, a.kind, "failed", LABEL.failed(lang)) };
  const circle = a.circle ? matchByName(ctx.data.circles, a.circle, (c) => [c.name]) : null;
  if (a.circle && !circle) return { card: card(lang, a.kind, "failed", LABEL.notFound(lang, "circle", a.circle), "/circles") };
  const pool = ctx.data.sections.filter((s) => (s.circleId ?? null) === (circle?.id ?? null));
  const existing = sameSection(pool, user.id, name, a.money_kind ?? "expense", circle?.id ?? null) ?? matchByName(pool, name, (s) => [s.name]);
  if (existing) {
    if (a.amount && existing.ownerId === user.id) {
      await prisma.moneySection.update({ where: { id: existing.id }, data: { budget: new Prisma.Decimal(a.amount) } });
      return { card: card(lang, a.kind, "done", LABEL.budgetSet(lang, existing.name, a.amount), `/money/${existing.id}`), refresh: true };
    }
    return { card: card(lang, a.kind, "done", LABEL.sectionExists(lang, existing.name), `/money/${existing.id}`) };
  }
  if ((await prisma.moneySection.count({ where: { ownerId: user.id } })) >= MAX_SECTIONS) return { card: card(lang, a.kind, "failed", LABEL.tooMany(lang), "/money") };
  const made = await prisma.moneySection.create({
    data: { ownerId: user.id, circleId: circle?.id ?? null, name, kind: a.money_kind ?? "expense", budget: a.amount ? new Prisma.Decimal(a.amount) : null, createdAt: ctx.now },
  });
  await prisma.event.create({ data: { userId: user.id, name: "money_section_created", propsJson: { kind: made.kind, shared: Boolean(made.circleId), budget: Boolean(made.budget), via: "chat" } } });
  // A shared book is seen by the circle at once: no undo there.
  return { card: card(lang, a.kind, "done", LABEL.sectionMade(lang, name, a.amount ?? null, circle?.name ?? null), `/money/${made.id}`, undefined, circle ? undefined : { kind: "section", sectionId: made.id }), refresh: true };
}

async function makeTracker(ctx: Ctx, a: AppAction): Promise<One> {
  const { lang, prisma, user } = ctx;
  const kind: TrackerKind = a.tracker_kind ?? "custom";
  const name = kind === "custom" ? (a.name ?? a.tracker)?.slice(0, 40) : undefined;
  if (kind === "custom" && !name) return { card: card(lang, a.kind, "failed", LABEL.failed(lang)) };
  const already = kind === "custom" ? matchByName(ctx.data.trackers.filter((t) => t.kind === "custom"), name, (t) => [t.name]) : ctx.data.trackers.find((t) => t.kind === kind) ?? null;
  if (already) {
    if (a.ask_times?.length) {
      const askTimes = [...new Set(a.ask_times)].sort();
      await prisma.tracker.update({ where: { id: already.id }, data: { askTimes } });
      return { card: card(lang, a.kind, "done", LABEL.trackerUpdated(lang, trackerLabel(kindOf(already), already.name, lang), askTimes, null), "/trackers"), refresh: true };
    }
    return { card: card(lang, a.kind, "done", LABEL.trackerExists(lang, trackerLabel(kindOf(already), already.name, lang)), "/trackers") };
  }
  const circle = a.circle ? matchByName(ctx.data.circles, a.circle, (c) => [c.name]) : null;
  if (a.circle && !circle) return { card: card(lang, a.kind, "failed", LABEL.notFound(lang, "circle", a.circle), "/circles") };
  const made = await createTracker(prisma, user, { kind, ...(name ? { name } : {}), ...(a.amount ? { goal: a.amount } : {}), ...(a.ask_times ? { ask_times: a.ask_times } : {}), ...(a.unit && kind === "custom" ? { unit_label: a.unit } : {}), circle_id: circle?.id ?? null }, ctx.now);
  if (made === "limit") return { card: card(lang, a.kind, "failed", LABEL.trackerLimit(lang), "/paywall") };
  if (made === "bad_circle") return { card: card(lang, a.kind, "failed", LABEL.notFound(lang, "circle", a.circle), "/circles") };
  await prisma.event.create({ data: { userId: user.id, name: "tracker_created", propsJson: { kind, via: "chat_ai", shared: Boolean(circle) } } });
  return { card: card(lang, a.kind, "done", LABEL.trackerMade(lang, trackerLabel(kind, made.name, lang), made.askTimes, circle?.name ?? null), "/trackers", undefined, { kind: "tracker", trackerId: made.id }), refresh: true };
}

async function makeCircle(ctx: Ctx, a: AppAction): Promise<One> {
  const { lang, prisma, user } = ctx;
  const name = a.name?.slice(0, 40);
  if (!name) return { card: card(lang, a.kind, "failed", LABEL.failed(lang)) };
  const existing = matchByName(ctx.data.circles, name, (c) => [c.name]);
  if (existing && foldEq(existing.name, name)) return { card: card(lang, a.kind, "done", LABEL.circleExists(lang, existing.name), `/circle/${existing.id}`) };
  if ((await prisma.circleMember.count({ where: { userId: user.id } })) >= MAX_CIRCLES_PER_USER) return { card: card(lang, a.kind, "failed", LABEL.tooMany(lang), "/circles") };
  const kind = a.family ? "family" : "friends";
  const circle = await prisma.circle.create({
    data: { kind, name, createdById: user.id, createdAt: ctx.now, members: { create: { userId: user.id, role: "owner", joinedAt: ctx.now } } },
  });
  await prisma.event.create({ data: { userId: user.id, name: "circle_created", propsJson: { kind, via: "chat" } } });
  return { card: card(lang, a.kind, "done", LABEL.circleMade(lang, name), `/circle/${circle.id}`, undefined, { kind: "circle", circleId: circle.id }), refresh: true };
}

const foldEq = (x: string, y: string) => x.trim().toLowerCase() === y.trim().toLowerCase();

async function planTask(ctx: Ctx, a: AppAction): Promise<One> {
  const { lang, user } = ctx;
  const title = (a.title ?? a.name ?? a.text)?.slice(0, 120);
  if (!title || !a.person) return { card: card(lang, a.kind, "failed", LABEL.failed(lang)) };
  const circles = a.circle ? ctx.data.circles.filter((c) => matchByName([c], a.circle, (x) => [x.name])) : ctx.data.circles;
  if (a.circle && !circles.length) return { card: card(lang, a.kind, "failed", LABEL.notFound(lang, "circle", a.circle), "/circles") };
  // The person, across the circles in play; the same person in two circles is still one person.
  const hits = circles.flatMap((c) => c.members.filter((m) => m.userId !== user.id).map((m) => ({ circle: c, member: m })));
  const match = matchByName(
    [...new Map(hits.map((h) => [h.member.userId, h])).values()],
    a.person,
    (h) => [h.member.name],
  );
  if (!match) return { card: card(lang, a.kind, "failed", LABEL.notFound(lang, "person", a.person), "/circles") };
  const tz = user.timezone;
  const dueAt = safeLocalToUtc(a.due_at_local, tz);
  const remindAt = safeLocalToUtc(a.remind_at_local, tz);
  const who = match.member.name ?? a.person;
  return {
    card: card(lang, a.kind, "pending", LABEL.taskAsk(lang, who, title, match.circle.name), `/circle/${match.circle.id}`, {
      kind: "assign_task",
      circleId: match.circle.id,
      assigneeId: match.member.userId,
      title,
      dueAt: dueAt?.toISOString() ?? null,
      remindAt: remindAt?.toISOString() ?? null,
      homework: a.homework ?? false,
      note: a.note ?? null,
    }),
  };
}

/**
 * The user's answer to a waiting card (tap, or "yes" in the chat). Runs the stored payload,
 * never the model text again. Idempotent: a card that is no longer pending is left as it is.
 */
export async function answerCard(prisma: PrismaClient, user: User, c: StoredCard, confirm: boolean, now: Date, opts: { requireSubscription?: boolean } = {}): Promise<{ card: StoredCard; notices: Notice[] }> {
  if (c.status !== "pending" || !c.payload) return { card: c, notices: [] };
  const { lang } = c;
  // On someone else's news, "No" is an answer too (decline the request, ask for a redo).
  const { noPayload, ...plain } = c;
  if (!confirm && noPayload) return answerCard(prisma, user, { ...plain, payload: noPayload }, true, now, opts);
  c = plain;
  if (!confirm) {
    const { payload: _drop, ...rest } = c;
    return { card: { ...rest, status: "cancelled", label: `${c.label} · ${LABEL.cancelled(lang)}` }, notices: [] };
  }
  const more = await runMorePending(prisma, user, c, now);
  if (more) return more;
  const p = c.payload!; // checked at the top
  const done = (label: string, route: string | null): StoredCard => {
    const { payload: _drop, ...rest } = c;
    return { ...rest, status: "done", label, route };
  };
  const fail = (label: string): StoredCard => {
    const { payload: _drop, ...rest } = c;
    return { ...rest, status: "failed", label };
  };
  if (p.kind === "log_money") {
    const section = await prisma.moneySection.findFirst({ where: { id: p.sectionId, ...visibleTo(user.id) }, include: { circle: { select: { name: true } } } });
    if (!section) return { card: fail(LABEL.notFound(lang, "section")), notices: [] };
    const added = await addEntry(prisma, section, user, { amount: p.amount, note: p.note, source: "chat" }, now);
    await prisma.event.create({ data: { userId: user.id, name: "money_logged", propsJson: { via: "chat_ai", shared: Boolean(section.circleId) } } });
    return { card: done(LABEL.moneyLogged(lang, p.moneyKind, p.amount, section.name, added.monthTotal), `/money/${section.id}`), notices: added.notices.filter((n) => n.userId !== user.id) };
  }
  if (p.kind === "assign_task") {
    const made = await assignTask(prisma, { circleId: p.circleId, assignerId: user.id, assigneeId: p.assigneeId, title: p.title, dueAt: p.dueAt ? new Date(p.dueAt) : null, remindAt: p.remindAt ? new Date(p.remindAt) : null, homework: p.homework, note: p.note }, now);
    if (made === "not_members") return { card: fail(LABEL.notFound(lang, "person")), notices: [] };
    if (made === "too_many") return { card: fail(LABEL.tooMany(lang)), notices: [] };
    return { card: done(LABEL.taskSent(lang, made.task.assignee.name ?? "?", p.title), `/circle/${p.circleId}`), notices: made.notices };
  }
  if (p.kind !== "ask_circle") return { card: fail(LABEL.failed(lang)), notices: [] };
  const circle = await prisma.circle.findFirst({ where: { id: p.circleId, members: { some: { userId: user.id } } }, include: { members: { select: { userId: true } } } });
  if (!circle) return { card: fail(LABEL.notFound(lang, "circle")), notices: [] };
  const asked = await askZaki(prisma, circle, user, p.text, now, opts.requireSubscription ?? false);
  return { card: done(LABEL.circlePosted(lang, circle.name), `/circle/${circle.id}`), notices: asked.notices };
}

/** Save cards onto a reply (merged with any already there). */
export async function attachCards(prisma: PrismaClient, messageId: string, existing: unknown, cards: StoredCard[]) {
  const all = [...storedCards(existing), ...cards];
  return prisma.message.update({ where: { id: messageId }, data: { actionsJson: all as unknown as Prisma.InputJsonValue } });
}
