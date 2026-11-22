import type { FastifyPluginAsync, preHandlerAsyncHookHandler } from "fastify";
import { INSTALL_ID_HEADER, parseInstapayLink, PatchMeRequest, type ExportResponse, type MeResponse } from "@fakkarni/shared";
import { z } from "zod";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { coveredByFamilyPlan } from "../billing/family";
import { isValidTimeZone } from "../lib/time";
import { linkInstallToAccount, type AuthConfig } from "../plugins/auth";
import { toWireEntry, withPeople as daftarPeople } from "../daftar/store";
import { readsNewKinds, toWireItem, toWireMemory, toWireMessage, toWireUser } from "../serialize";

export interface MeRoutesOptions {
  prisma: PrismaClient;
  auth: AuthConfig;
  authenticate: preHandlerAsyncHookHandler;
  /** Deletes the Supabase auth user too (needs the service role key); optional. */
  deleteAuthUser?: (sub: string) => Promise<void>;
}

const toDbLanguage = (l: "ar-EG" | "en") => (l === "ar-EG" ? "ar_EG" : "en");
const toDbInterval = (i: "2" | "4" | "off") => (i === "2" ? "h2" : i === "4" ? "h4" : "off");

export const meRoutes: FastifyPluginAsync<MeRoutesOptions> = async (app, opts) => {
  const { prisma } = opts;
  app.addHook("preHandler", opts.authenticate);

  app.get("/me", async (req) => {
    const user = toWireUser(req.user);
    // A relative's Family plan also gives Pro.
    if (!user.pro) user.pro = await coveredByFamilyPlan(prisma, req.user.id, new Date());
    const res: MeResponse = { user };
    return res;
  });

  /** F10 settings: wake/sleep, check-ins, tone, language, always-direct reminders. */
  app.patch("/me", async (req, reply) => {
    const body = PatchMeRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body", issues: body.error.issues });
    const b = body.data;
    if (b.timezone && !isValidTimeZone(b.timezone)) return reply.code(400).send({ error: "invalid_timezone" });
    const data: Prisma.UserUpdateInput = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.language) data.language = toDbLanguage(b.language);
    if (b.timezone) data.timezone = b.timezone;
    if (b.wake_time) data.wakeTime = b.wake_time;
    if (b.sleep_time) data.sleepTime = b.sleep_time;
    if (b.tone) data.tone = b.tone;
    if (b.checkin_interval_h) {
      data.checkinIntervalH = toDbInterval(b.checkin_interval_h);
      // A deliberate choice resets the auto-slowdown.
      data.ignoredCheckins = 0;
      data.slowdownNoticed = false;
    }
    if (b.always_direct !== undefined) data.alwaysDirect = b.always_direct;
    if (b.instapay_link !== undefined) {
      const link = b.instapay_link ? parseInstapayLink(b.instapay_link) : null;
      if (b.instapay_link && !link) return reply.code(400).send({ error: "invalid_instapay_link" });
      data.instapayLink = link;
    }
    const user = await prisma.user.update({ where: { id: req.user.id }, data });
    const res: MeResponse = { user: toWireUser(user) };
    return res;
  });

  /** F10/FR-13 export: everything we hold about the user, as JSON. */
  app.get("/me/export", async (req) => {
    const where = { userId: req.user.id };
    const id = req.user.id;
    const [messages, items, memories, summaries, circles, daftar, tasks, trackers, checkins, sessions, money, comments] = await Promise.all([
      prisma.message.findMany({ where, orderBy: { createdAt: "asc" } }),
      prisma.item.findMany({ where, orderBy: { createdAt: "asc" } }),
      prisma.memory.findMany({ where, orderBy: { createdAt: "asc" } }),
      prisma.summary.findMany({ where, orderBy: { periodEnd: "asc" } }),
      prisma.circleMember.findMany({ where, include: { circle: true }, orderBy: { joinedAt: "asc" } }),
      prisma.daftarEntry.findMany({ where: { OR: [{ creatorId: id }, { otherUserId: id }] }, include: daftarPeople, orderBy: { createdAt: "asc" } }),
      prisma.circleTask.findMany({ where: { OR: [{ assignerId: id }, { assigneeId: id }] }, orderBy: { createdAt: "asc" } }),
      prisma.tracker.findMany({ where, include: { entries: { orderBy: { at: "asc" } } }, orderBy: { createdAt: "asc" } }),
      prisma.circlePost.findMany({ where: { actorId: id, event: { startsWith: "checkin:" } }, orderBy: { createdAt: "asc" } }),
      prisma.reflectSession.findMany({ where, include: { messages: { orderBy: { createdAt: "asc" } } }, orderBy: { startedAt: "asc" } }),
      prisma.moneySection.findMany({
        where: { OR: [{ ownerId: id, circleId: null }, { entries: { some: { userId: id } } }] },
        include: { entries: { where: { userId: id }, orderBy: { at: "asc" } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.postComment.findMany({ where: { userId: id }, orderBy: { createdAt: "asc" } }),
    ]);
    const res: ExportResponse = {
      exported_at: new Date().toISOString(),
      user: toWireUser(req.user),
      messages: messages.map((m) => toWireMessage(m, readsNewKinds(req))),
      items: items.map(toWireItem),
      memories: memories.map(toWireMemory),
      summaries: summaries.map((s) => ({ period_start: s.periodStart.toISOString(), period_end: s.periodEnd.toISOString(), text: s.text })),
      circles: circles.map((m) => ({ name: m.circle.name, kind: m.circle.kind, role: m.role, joined_at: m.joinedAt.toISOString() })),
      daftar: daftar.map((e) => {
        const w = toWireEntry(e, id, "");
        return { other_name: w.other_name, direction: w.direction, amount: w.amount, currency: w.currency, note: w.note, status: w.status, created_at: w.created_at };
      }),
      sessions: sessions.map((x) => ({ mode: x.mode, mood: x.mood, started_at: x.startedAt.toISOString(), ended_at: x.endedAt?.toISOString() ?? null, messages: x.messages.map((m) => ({ role: m.role, text: m.text, created_at: m.createdAt.toISOString() })) })),
      checkins: checkins.map((c) => ({ kind: c.event.slice(8), note: c.title, at: c.createdAt.toISOString() })),
      tasks: tasks.map((t) => ({ title: t.title, role: t.assignerId === id ? "assigner" : "assignee", status: t.status, due_at: t.dueAt?.toISOString() ?? null, created_at: t.createdAt.toISOString() })),
      trackers: trackers.map((t) => ({ kind: t.kind, name: t.name, goal: t.goal === null ? null : Number(t.goal), entries: t.entries.map((e) => ({ amount: Number(e.amount), source: e.source, at: e.at.toISOString() })) })),
      feed_comments: comments.map((c) => ({ text: c.text ?? "", at: c.createdAt.toISOString() })),
      money: money.map((s) => ({ name: s.name, kind: s.kind, budget: s.budget === null ? null : Number(s.budget), shared: Boolean(s.circleId), entries: s.entries.map((e) => ({ amount: Number(e.amount), note: e.note, at: e.at.toISOString() })) })),
    };
    return res;
  });

  /** FR-13: account deletion removes all data immediately (well inside the 24 h target). */
  app.delete("/me", async (req, reply) => {
    const user = req.user;
    await prisma.$transaction(async (tx) => {
      // Circle posts point at users by plain id (no foreign key), so remove the user's own
      // words (check-in notes, iftar notes, RSVPs) and posts about them here.
      await tx.circlePost.deleteMany({ where: { OR: [{ actorId: user.id }, { targetId: user.id }] } });
      // Circles they own pass to the longest-standing member, as when an owner leaves;
      // a circle left with nobody in it goes too.
      const owned = await tx.circleMember.findMany({ where: { userId: user.id, role: "owner" }, select: { circleId: true } });
      for (const { circleId } of owned) {
        const next = await tx.circleMember.findFirst({ where: { circleId, userId: { not: user.id } }, orderBy: [{ joinedAt: "asc" }, { userId: "asc" }] });
        if (next) await tx.circleMember.update({ where: { circleId_userId: { circleId, userId: next.userId } }, data: { role: "owner" } });
      }
      // Shared books they started stay with the circle: the next member looks after them.
      for (const book of await tx.moneySection.findMany({ where: { ownerId: user.id, circleId: { not: null } }, select: { id: true, circleId: true } })) {
        const next = await tx.circleMember.findFirst({ where: { circleId: book.circleId!, userId: { not: user.id } }, orderBy: [{ joinedAt: "asc" }, { userId: "asc" }] });
        if (next) await tx.moneySection.update({ where: { id: book.id }, data: { ownerId: next.userId } });
      }
      const alone = await tx.circle.findMany({ where: { members: { some: { userId: user.id }, every: { userId: user.id } } }, select: { id: true } });
      if (alone.length) await tx.circle.deleteMany({ where: { id: { in: alone.map((c) => c.id) } } });
      await tx.user.delete({ where: { id: user.id } }); // cascades to every other table
    });
    if (user.authId.startsWith("supabase:") && opts.deleteAuthUser) {
      try {
        await opts.deleteAuthUser(user.authId.slice("supabase:".length));
      } catch (err) {
        req.log.error({ err: (err as Error).name }, "auth user deletion failed; retry manually");
      }
    }
    return reply.code(204).send();
  });

  /** After sign-in on a phone that was used before signing in: keep what it captured. */
  app.post("/auth/link", async (req, reply) => {
    const installId = z.uuid().safeParse(req.headers[INSTALL_ID_HEADER]);
    if (!req.user.authId.startsWith("supabase:")) return reply.code(400).send({ error: "sign_in_required" });
    if (!installId.success) return { user: toWireUser(req.user) } satisfies MeResponse;
    const user = await linkInstallToAccount(prisma, installId.data, req.user.authId);
    const res: MeResponse = { user: toWireUser(user) };
    return res;
  });
};
