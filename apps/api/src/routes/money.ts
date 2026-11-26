import type { FastifyPluginAsync, preHandlerAsyncHookHandler } from "fastify";
import { z } from "zod";
import {
  AddMoneyEntryRequest,
  CreateSectionRequest,
  MAX_SECTIONS,
  Month,
  UpdateSectionRequest,
  type MonthGift,
  type MoneyOverview,
  type SectionDetail,
  type SectionResponse,
} from "@fakkarni/shared";
import { Prisma, type PrismaClient, type User } from "../generated/prisma/client";
import { pushNotices } from "../proactive/notify";
import type { PushSender } from "../proactive/push";
import { balances, monthOf, monthRange, settleUp } from "../money/rules";
import { addEntry, mergeDuplicateSections, sameSection, toWireEntry, toWireSection, toWireSections, visibleTo } from "../money/store";
import { monthGift } from "../money/gift";
import { inBackground } from "../lib/background";

export interface MoneyRoutesOptions {
  prisma: PrismaClient;
  authenticate: preHandlerAsyncHookHandler;
  now?: () => Date;
  push?: PushSender;
}

const IdParam = z.object({ id: z.uuid() });
const MonthQuery = z.object({ month: Month.optional() });

/**
 * Wider Daftar: expense / income sections with monthly budgets, and circle shared books.
 * Free for everyone (shared features are never capped). Records only, never money movement.
 */
export const moneyRoutes: FastifyPluginAsync<MoneyRoutesOptions> = async (app, opts) => {
  const { prisma } = opts;
  const now = opts.now ?? (() => new Date());
  app.addHook("preHandler", opts.authenticate);

  const section = async (params: unknown, user: User) => {
    const p = IdParam.safeParse(params);
    return p.success ? prisma.moneySection.findFirst({ where: { id: p.data.id, ...visibleTo(user.id) }, include: { circle: { select: { name: true } } } }) : null;
  };
  const monthFor = (query: unknown, user: User) => MonthQuery.safeParse(query).data?.month ?? monthOf(now(), user.timezone);

  app.get("/money", async (req) => {
    const month = monthFor(req.query, req.user);
    const found = await prisma.moneySection.findMany({ where: visibleTo(req.user.id), include: { circle: { select: { name: true } } }, orderBy: { createdAt: "asc" }, take: 200 });
    const rows = await mergeDuplicateSections(prisma, req.user.id, found);
    const sections = await toWireSections(prisma, rows, req.user, month);
    // Totals are the caller's own money: their share of shared books, all of their own sections.
    const sum = (kind: string) => Math.round(sections.filter((s) => s.kind === kind).reduce((n, s) => n + s.my_share, 0) * 100) / 100;
    return { month, sections, totals: { expense: sum("expense"), income: sum("income") } } satisfies MoneyOverview;
  });

  app.post("/money/sections", async (req, reply) => {
    const body = CreateSectionRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    const circleId = body.data.circle_id ?? null;
    const month = monthOf(now(), req.user.timezone);
    // One round of lookups (each is ~0.1 s in production): membership, a section with this id
    // (a retried create), and the sections this one could duplicate.
    const [member, had, near] = await Promise.all([
      circleId ? prisma.circleMember.count({ where: { circleId, userId: req.user.id } }) : Promise.resolve(1),
      body.data.id ? prisma.moneySection.findUnique({ where: { id: body.data.id }, include: { circle: { select: { name: true } } } }) : Promise.resolve(null),
      prisma.moneySection.findMany({ where: circleId ? { circleId } : { ownerId: req.user.id }, include: { circle: { select: { name: true } } }, take: 300 }),
    ]);
    if (!member) return reply.code(400).send({ error: "invalid_circle" });
    if (had) {
      if (had.ownerId !== req.user.id) return reply.code(422).send({ error: "id_in_use" });
      return reply.code(200).send({ section: await toWireSection(prisma, had, req.user, month) } satisfies SectionResponse);
    }
    // "Salary" when "salary" exists: the existing one, never a twin.
    const same = sameSection(near, req.user.id, body.data.name, body.data.kind, circleId);
    if (same) return reply.code(200).send({ section: await toWireSection(prisma, same, req.user, month) } satisfies SectionResponse);
    // 422, not 409: a phone resends writes that got a 409 (busy), and this one will never pass.
    if (near.filter((x) => x.ownerId === req.user.id).length >= MAX_SECTIONS) return reply.code(422).send({ error: "too_many" });
    const made = await prisma.moneySection.create({
      data: {
        ...(body.data.id ? { id: body.data.id } : {}),
        ownerId: req.user.id,
        circleId: body.data.circle_id ?? null,
        name: body.data.name,
        kind: body.data.kind,
        budget: body.data.budget ? new Prisma.Decimal(body.data.budget) : null,
        createdAt: now(),
      },
      include: { circle: { select: { name: true } } },
    });
    await prisma.event.create({ data: { userId: req.user.id, name: "money_section_created", propsJson: { kind: made.kind, shared: Boolean(made.circleId), budget: Boolean(made.budget) } } });
    // A new section has no entries yet: no need to ask the database for them.
    return reply.code(201).send({ section: await toWireSection(prisma, made, req.user, month, []) } satisfies SectionResponse);
  });

  app.get("/money/sections/:id", async (req, reply) => {
    const s = await section(req.params, req.user);
    if (!s) return reply.code(404).send({ error: "not_found" });
    const month = monthFor(req.query, req.user);
    const { from, to } = monthRange(month, req.user.timezone);
    const [entries, all, members] = await Promise.all([
      prisma.moneyEntry.findMany({ where: { sectionId: s.id, at: { gte: from, lt: to } }, include: { user: { select: { name: true } } }, orderBy: { at: "desc" }, take: 300 }),
      s.circleId ? prisma.moneyEntry.findMany({ where: { sectionId: s.id }, select: { userId: true, amount: true, split: true } }) : Promise.resolve([]),
      s.circleId ? prisma.circleMember.findMany({ where: { circleId: s.circleId }, include: { user: { select: { id: true, name: true } } }, orderBy: { joinedAt: "asc" } }) : Promise.resolve([]),
    ]);
    const names = new Map<string, string | null>(members.map((m) => [m.userId, m.user.name]));
    const missing = all.flatMap((e) => [e.userId, ...e.split]).filter((id) => !names.has(id));
    if (missing.length) for (const u of await prisma.user.findMany({ where: { id: { in: [...new Set(missing)] } }, select: { id: true, name: true } })) names.set(u.id, u.name);
    const settle = s.circleId
      ? settleLines(balances(all.map((e) => ({ payerId: e.userId, amount: Number(e.amount), split: e.split }))), names, req.user.id)
      : [];
    const res: SectionDetail = {
      // This month's entries are already here: no second query for the total.
      section: await toWireSection(prisma, s, req.user, month, entries),
      entries: entries.map((e) => toWireEntry(e, req.user.id)),
      settle,
      members: members.map((m) => ({ user_id: m.userId, name: m.user.name, is_me: m.userId === req.user.id })),
    };
    return res;
  });

  app.patch("/money/sections/:id", async (req, reply) => {
    const s = await section(req.params, req.user);
    const body = UpdateSectionRequest.safeParse(req.body);
    if (!s) return reply.code(404).send({ error: "not_found" });
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    if (s.ownerId !== req.user.id) return reply.code(403).send({ error: "owner_only" });
    const updated = await prisma.moneySection.update({
      where: { id: s.id },
      data: { ...(body.data.name ? { name: body.data.name } : {}), ...(body.data.budget !== undefined ? { budget: body.data.budget === null ? null : new Prisma.Decimal(body.data.budget) } : {}) },
      include: { circle: { select: { name: true } } },
    });
    return { section: await toWireSection(prisma, updated, req.user, monthOf(now(), req.user.timezone)) } satisfies SectionResponse;
  });

  app.delete("/money/sections/:id", async (req, reply) => {
    const s = await section(req.params, req.user);
    if (!s) return reply.code(404).send({ error: "not_found" });
    if (s.ownerId !== req.user.id) return reply.code(403).send({ error: "owner_only" });
    await prisma.moneySection.delete({ where: { id: s.id } });
    return reply.code(204).send();
  });

  app.post("/money/sections/:id/entries", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const s = await section(req.params, req.user);
    const body = AddMoneyEntryRequest.safeParse(req.body);
    if (!s) return reply.code(404).send({ error: "not_found" });
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    const at = now();
    let added;
    try {
      added = await addEntry(prisma, s, req.user, { ...(body.data.id ? { id: body.data.id } : {}), amount: body.data.amount, note: body.data.note || null, split: body.data.split, source: "app" }, at);
    } catch (err) {
      if (body.data.id && err instanceof Error && err.message === "money entry id in use") return reply.code(422).send({ error: "id_in_use" });
      throw err;
    }
    if (!added.replay) {
      void pushNotices(prisma, opts.push, added.notices.filter((n) => n.userId !== req.user.id), app.log);
      inBackground(prisma.event.create({ data: { userId: req.user.id, name: "money_logged", propsJson: { via: "app", shared: Boolean(s.circleId) } } }));
    }
    return reply.code(added.replay ? 200 : 201).send({
      section: await toWireSection(prisma, s, req.user, monthOf(at, req.user.timezone)),
      entry: toWireEntry({ ...added.entry, user: { name: req.user.name } }, req.user.id),
    } satisfies SectionResponse);
  });

  /** Remove one of your own entries (a slip of the thumb, or it was wrong). */
  app.delete("/money/entries/:id", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: "not_found" });
    const deleted = await prisma.moneyEntry.deleteMany({ where: { id: p.data.id, userId: req.user.id } });
    return deleted.count ? reply.code(204).send() : reply.code(404).send({ error: "not_found" });
  });

  /** Zaki's end-of-month gift for a month (default: the one that just ended). */
  app.get("/money/gift", async (req) => {
    const month = MonthQuery.safeParse(req.query).data?.month;
    return (await monthGift(prisma, req.user, now(), month)) satisfies MonthGift;
  });

};

function settleLines(bal: Map<string, number>, names: Map<string, string | null>, me: string) {
  const out: SectionDetail["settle"] = [];
  for (const t of settleUp(bal)) {
    out.push({ from_name: names.get(t.from) ?? null, to_name: names.get(t.to) ?? null, amount: t.amount, from_me: t.from === me, to_me: t.to === me });
  }
  return out;
}
