import type { FastifyPluginAsync, preHandlerAsyncHookHandler } from "fastify";
import { z } from "zod";
import { CreateTrackerRequest, isRamadanSeason, LogTrackerRequest, RAMADAN_PACK, TRACKER_TEMPLATES, TrackerKind, type ListTrackersResponse, type TrackerResponse } from "@fakkarni/shared";
import type { PrismaClient } from "../generated/prisma/client";
import { addRamadanPack, createTracker, logEntry, toWireTracker, trackerLimit } from "../trackers/store";

export interface TrackerRoutesOptions {
  prisma: PrismaClient;
  authenticate: preHandlerAsyncHookHandler;
  now?: () => Date;
}

const IdParam = z.object({ id: z.uuid() });

/** The trackers dashboard. Free: 1 tracker. Pro: no limit. Logging is always free. */
export const trackerRoutes: FastifyPluginAsync<TrackerRoutesOptions> = async (app, opts) => {
  const { prisma } = opts;
  const now = opts.now ?? (() => new Date());
  app.addHook("preHandler", opts.authenticate);

  const mine = async (params: unknown, userId: string) => {
    const p = IdParam.safeParse(params);
    return p.success ? prisma.tracker.findFirst({ where: { id: p.data.id, userId } }) : null;
  };

  app.get("/trackers", async (req) => {
    const at = now();
    const rows = await prisma.tracker.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: "asc" }, take: 50 });
    const res: ListTrackersResponse = {
      trackers: await Promise.all(rows.map((t) => toWireTracker(prisma, t, req.user.timezone, at))),
      limit: await trackerLimit(prisma, req.user, at),
      ramadan_pack: !isRamadanSeason(at) ? "off" : RAMADAN_PACK.every((k) => rows.some((t) => t.kind === k)) ? "added" : "available",
    };
    return res;
  });

  app.post("/trackers", async (req, reply) => {
    const body = CreateTrackerRequest.safeParse(req.body);
    if (!body.success || (body.data.kind === "custom" && !body.data.name)) return reply.code(400).send({ error: "invalid_body" });
    const at = now();
    const made = await createTracker(prisma, req.user, body.data, at);
    // 402 = the app shows Zaki Pro. Keeping and logging the one free tracker never hits this.
    if (made === "limit") return reply.code(402).send({ error: "tracker_limit" });
    await prisma.event.create({ data: { userId: req.user.id, name: "tracker_created", propsJson: { kind: body.data.kind, via: "app" } } });
    return reply.code(201).send({ tracker: await toWireTracker(prisma, made, req.user.timezone, at) } satisfies TrackerResponse);
  });

  /** The Ramadan pack: fasting, prayers, Quran and charity, free for everyone during the season. */
  app.post("/trackers/ramadan-pack", async (req, reply) => {
    const at = now();
    const made = await addRamadanPack(prisma, req.user, at);
    if (made === "off") return reply.code(409).send({ error: "not_in_season" });
    if (made.length) await prisma.event.create({ data: { userId: req.user.id, name: "ramadan_pack_added", propsJson: { added: made.length } } });
    return reply.code(204).send();
  });

  /** One tap: adds the template's step (a cup, a prayer) or the amount given (money). */
  app.post("/trackers/:id/entries", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const tracker = await mine(req.params, req.user.id);
    const body = LogTrackerRequest.safeParse(req.body ?? {});
    if (!tracker) return reply.code(404).send({ error: "not_found" });
    const amount = body.success ? body.data.amount ?? TRACKER_TEMPLATES[TrackerKind.catch("custom").parse(tracker.kind)].step : 0;
    if (!body.success || amount <= 0) return reply.code(400).send({ error: "invalid_body" });
    const at = now();
    await logEntry(prisma, tracker.id, amount, "tap", at);
    await prisma.event.create({ data: { userId: req.user.id, name: "tracker_logged", propsJson: { kind: tracker.kind, via: "tap" } } });
    return { tracker: await toWireTracker(prisma, tracker, req.user.timezone, at) } satisfies TrackerResponse;
  });

  /** Undo a slip of the thumb: removes the newest entry. */
  app.post("/trackers/:id/undo", async (req, reply) => {
    const tracker = await mine(req.params, req.user.id);
    if (!tracker) return reply.code(404).send({ error: "not_found" });
    const last = await prisma.trackerEntry.findFirst({ where: { trackerId: tracker.id }, orderBy: { at: "desc" } });
    if (!last) return reply.code(409).send({ error: "nothing_to_undo" });
    await prisma.trackerEntry.delete({ where: { id: last.id } });
    return { tracker: await toWireTracker(prisma, tracker, req.user.timezone, now()) } satisfies TrackerResponse;
  });

  app.delete("/trackers/:id", async (req, reply) => {
    const tracker = await mine(req.params, req.user.id);
    if (!tracker) return reply.code(404).send({ error: "not_found" });
    await prisma.tracker.delete({ where: { id: tracker.id } });
    return reply.code(204).send();
  });
};
