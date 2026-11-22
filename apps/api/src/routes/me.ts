import type { FastifyPluginAsync, preHandlerAsyncHookHandler } from "fastify";
import { INSTALL_ID_HEADER, parseInstapayLink, PatchMeRequest, type ExportResponse, type MeResponse } from "@fakkarni/shared";
import { z } from "zod";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { coveredByFamilyPlan } from "../billing/family";
import { isValidTimeZone } from "../lib/time";
import { linkInstallToAccount, type AuthConfig } from "../plugins/auth";
import { toWireEntry, withPeople as daftarPeople } from "../daftar/store";
import { toWireItem, toWireMemory, toWireMessage, toWireUser } from "../serialize";

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
    const [messages, items, memories, summaries, circles, daftar, tasks, trackers] = await Promise.all([
      prisma.message.findMany({ where, orderBy: { createdAt: "asc" } }),
      prisma.item.findMany({ where, orderBy: { createdAt: "asc" } }),
      prisma.memory.findMany({ where, orderBy: { createdAt: "asc" } }),
      prisma.summary.findMany({ where, orderBy: { periodEnd: "asc" } }),
      prisma.circleMember.findMany({ where, include: { circle: true }, orderBy: { joinedAt: "asc" } }),
      prisma.daftarEntry.findMany({ where: { OR: [{ creatorId: id }, { otherUserId: id }] }, include: daftarPeople, orderBy: { createdAt: "asc" } }),
      prisma.circleTask.findMany({ where: { OR: [{ assignerId: id }, { assigneeId: id }] }, orderBy: { createdAt: "asc" } }),
      prisma.tracker.findMany({ where, include: { entries: { orderBy: { at: "asc" } } }, orderBy: { createdAt: "asc" } }),
    ]);
    const res: ExportResponse = {
      exported_at: new Date().toISOString(),
      user: toWireUser(req.user),
      messages: messages.map(toWireMessage),
      items: items.map(toWireItem),
      memories: memories.map(toWireMemory),
      summaries: summaries.map((s) => ({ period_start: s.periodStart.toISOString(), period_end: s.periodEnd.toISOString(), text: s.text })),
      circles: circles.map((m) => ({ name: m.circle.name, kind: m.circle.kind, role: m.role, joined_at: m.joinedAt.toISOString() })),
      daftar: daftar.map((e) => {
        const w = toWireEntry(e, id, "");
        return { other_name: w.other_name, direction: w.direction, amount: w.amount, currency: w.currency, note: w.note, status: w.status, created_at: w.created_at };
      }),
      tasks: tasks.map((t) => ({ title: t.title, role: t.assignerId === id ? "assigner" : "assignee", status: t.status, due_at: t.dueAt?.toISOString() ?? null, created_at: t.createdAt.toISOString() })),
      trackers: trackers.map((t) => ({ kind: t.kind, name: t.name, goal: t.goal === null ? null : Number(t.goal), entries: t.entries.map((e) => ({ amount: Number(e.amount), source: e.source, at: e.at.toISOString() })) })),
    };
    return res;
  });

  /** FR-13: account deletion removes all data immediately (well inside the 24 h target). */
  app.delete("/me", async (req, reply) => {
    const user = req.user;
    await prisma.user.delete({ where: { id: user.id } }); // cascades to every table
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
