import type { FastifyPluginAsync, preHandlerAsyncHookHandler } from "fastify";
import { z } from "zod";
import { CreateCareMedRequest, DEFAULT_MISSED_AFTER, MARK_WITHIN_HOURS, MarkDoseRequest, MAX_MEDS_PER_CIRCLE, UpdateCareMedRequest, type CareMedResponse } from "@fakkarni/shared";
import type { PrismaClient } from "../generated/prisma/client";
import { addedLine, canMark } from "../care/rules";
import { historyOf, isSlot, markDose, medInclude, readMed, toWireMed, visibleMeds } from "../care/store";
import { postUpdate } from "../daftar/store";
import { inBackground } from "../lib/background";
import { isValidTimeZone, localParts } from "../lib/time";
import { pushNotices, type Notice } from "../proactive/notify";
import type { PushSender } from "../proactive/push";
import { langOf } from "../tasks/store";

export interface CareRoutesOptions {
  prisma: PrismaClient;
  authenticate: preHandlerAsyncHookHandler;
  now?: () => Date;
  push?: PushSender;
}

const IdParam = z.object({ id: z.uuid() });
const hhmm = (d: Date, tz: string) => {
  const p = localParts(d, tz);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
};

/**
 * Care circles: GET /care (the medicines of every circle the caller is in, with today's doses),
 * add, change, pause, delete a medicine, mark a dose, and a week of history. Every member sees
 * and marks; reminders and missed-dose lines come from the care tick (care/tick.ts). Free; no AI.
 */
export const careRoutes: FastifyPluginAsync<CareRoutesOptions> = async (app, opts) => {
  const { prisma } = opts;
  const now = opts.now ?? (() => new Date());
  app.addHook("preHandler", opts.authenticate);

  const answer = async (userId: string, id: string, at: Date) => {
    const med = await readMed(prisma, userId, id, at);
    return med ? ({ med } satisfies CareMedResponse) : null;
  };

  /** Member ids of a circle, or null when the caller is not one of them. */
  const membersOf = async (circleId: string, userId: string) => {
    const rows = await prisma.circleMember.findMany({ where: { circleId }, select: { userId: true } });
    const ids = rows.map((r) => r.userId);
    return ids.includes(userId) ? ids : null;
  };

  app.get("/care", async (req) => {
    const at = now();
    const meds = await prisma.careMed.findMany({ where: visibleMeds(req.user.id), include: medInclude(at), orderBy: [{ createdAt: "asc" }], take: 100 });
    return { meds: meds.map((m) => toWireMed(m, req.user.id, at)) };
  });

  app.get("/care/meds/:id/history", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    const at = now();
    const med = p.success ? await prisma.careMed.findFirst({ where: { id: p.data.id, ...visibleMeds(req.user.id) }, include: medInclude(at) }) : null;
    if (!med) return reply.code(404).send({ error: "not_found" });
    return { days: historyOf(med, req.user.id, at) };
  });

  app.post("/care/meds", async (req, reply) => {
    const body = CreateCareMedRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    const at = now();
    const b = body.data;
    if (b.id && (await prisma.careMed.findUnique({ where: { id: b.id }, select: { id: true } }))) {
      const out = await answer(req.user.id, b.id, at);
      return out ? reply.code(200).send(out) : reply.code(422).send({ error: "taken" });
    }
    const members = await membersOf(b.circle_id, req.user.id);
    if (!members) return reply.code(422).send({ error: "invalid_circle" });
    const timeZone = b.time_zone ?? req.user.timezone;
    if (!isValidTimeZone(timeZone)) return reply.code(400).send({ error: "invalid_timezone" });
    const person = b.person_user_id && members.includes(b.person_user_id) ? b.person_user_id : null;
    if ((await prisma.careMed.count({ where: { circleId: b.circle_id } })) >= MAX_MEDS_PER_CIRCLE) return reply.code(422).send({ error: "too_many_meds" });
    const picked = (b.remind_user_ids ?? []).filter((id) => members.includes(id));
    const remind = picked.length ? [...new Set(picked)] : [person ?? req.user.id];
    const made = await prisma.careMed.create({
      data: {
        ...(b.id ? { id: b.id } : {}),
        circleId: b.circle_id,
        createdById: req.user.id,
        personName: b.person_name,
        personUserId: person,
        name: b.name,
        dose: b.dose || null,
        times: b.times,
        timeZone,
        remindUserIds: remind,
        missedAfterMinutes: b.missed_after_minutes ?? DEFAULT_MISSED_AFTER,
        note: b.note || null,
        createdAt: at,
        updatedAt: at,
      },
    });
    // Whoever will be reminded hears it from Zaki first, so the first reminder is no surprise.
    const tell = [...new Set([...remind, ...(person ? [person] : [])])].filter((id) => id !== req.user.id);
    if (tell.length) {
      const users = await prisma.user.findMany({ where: { id: { in: tell } }, select: { id: true, language: true } });
      const notices: Notice[] = [];
      for (const u of users) {
        const text = addedLine(langOf(u), { by: req.user.name, self: u.id === person, person: made.personName, name: made.name, times: made.times });
        await postUpdate(prisma, u.id, `care:${made.id}:added`, text, at);
        notices.push({ userId: u.id, text });
      }
      void pushNotices(prisma, opts.push, notices, app.log);
    }
    inBackground(prisma.event.create({ data: { userId: req.user.id, name: "care_med_added", propsJson: { times: made.times.length, for_member: Boolean(person), reminded: remind.length } } }));
    return reply.code(201).send(await answer(req.user.id, made.id, at));
  });

  app.patch("/care/meds/:id", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    const body = UpdateCareMedRequest.safeParse(req.body);
    if (!p.success) return reply.code(404).send({ error: "not_found" });
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    const at = now();
    const med = await prisma.careMed.findFirst({ where: { id: p.data.id, ...visibleMeds(req.user.id) }, select: { id: true, circleId: true } });
    if (!med) return reply.code(404).send({ error: "not_found" });
    const b = body.data;
    const members = b.remind_user_ids !== undefined || b.person_user_id !== undefined ? ((await membersOf(med.circleId, req.user.id)) ?? []) : [];
    const remind = b.remind_user_ids?.filter((id) => members.includes(id));
    if (remind && remind.length === 0) return reply.code(422).send({ error: "nobody_to_remind" });
    await prisma.careMed.update({
      where: { id: med.id },
      data: {
        ...(b.person_name !== undefined ? { personName: b.person_name } : {}),
        ...(b.person_user_id !== undefined ? { personUserId: b.person_user_id && members.includes(b.person_user_id) ? b.person_user_id : null } : {}),
        ...(b.name !== undefined ? { name: b.name } : {}),
        ...(b.dose !== undefined ? { dose: b.dose || null } : {}),
        ...(b.times !== undefined ? { times: b.times } : {}),
        ...(remind ? { remindUserIds: [...new Set(remind)] } : {}),
        ...(b.missed_after_minutes !== undefined ? { missedAfterMinutes: b.missed_after_minutes } : {}),
        ...(b.note !== undefined ? { note: b.note || null } : {}),
        ...(b.active !== undefined ? { active: b.active } : {}),
        updatedAt: at,
      },
    });
    return answer(req.user.id, med.id, at);
  });

  /** The one who added it, or the circle's owner. */
  app.delete("/care/meds/:id", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    const med = p.success
      ? await prisma.careMed.findFirst({ where: { id: p.data.id, ...visibleMeds(req.user.id) }, include: { circle: { select: { members: { where: { userId: req.user.id }, select: { role: true } } } } } })
      : null;
    if (!med) return reply.code(404).send({ error: "not_found" });
    if (med.createdById !== req.user.id && med.circle.members[0]?.role !== "owner") return reply.code(403).send({ error: "not_owner" });
    await prisma.careMed.delete({ where: { id: med.id } });
    return reply.code(204).send();
  });

  app.post("/care/meds/:id/doses", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    const body = MarkDoseRequest.safeParse(req.body);
    if (!p.success) return reply.code(404).send({ error: "not_found" });
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    const at = now();
    const med = await prisma.careMed.findFirst({ where: { id: p.data.id, ...visibleMeds(req.user.id) } });
    if (!med) return reply.code(404).send({ error: "not_found" });
    const dueAt = new Date(body.data.due_at);
    // 422, not 409: the phone resends 409s, and these never pass.
    if (!isSlot(med, dueAt, at)) return reply.code(422).send({ error: "not_a_dose" });
    if (!canMark(dueAt, at, MARK_WITHIN_HOURS)) return reply.code(422).send({ error: "too_late" });
    const notices = await markDose(prisma, med, dueAt, body.data.status, { id: req.user.id, name: req.user.name }, hhmm(dueAt, med.timeZone), at);
    void pushNotices(prisma, opts.push, notices, app.log);
    inBackground(prisma.event.create({ data: { userId: req.user.id, name: "care_dose_marked", propsJson: { status: body.data.status, via: "app" } } }));
    return answer(req.user.id, med.id, at);
  });
};
