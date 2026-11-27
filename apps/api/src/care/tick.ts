import type { FastifyBaseLogger } from "fastify";
import type { PrismaClient } from "../generated/prisma/client";
import { postUpdate } from "../daftar/store";
import { pushNotices, type Notice } from "../proactive/notify";
import type { PushSender } from "../proactive/push";
import { langOf } from "../tasks/store";
import { ALERT_WINDOW_MS, doseState, missedLine, remindLine, REMIND_WINDOW_MS, slotsBetween, TICK_LOOKBACK_MS } from "./rules";
import { takenCard } from "./store";

export interface CareTickDeps {
  prisma: PrismaClient;
  push?: PushSender;
  log?: FastifyBaseLogger;
}

/**
 * Every minute (its own pg-boss queue, apart from the per-user proactive tick, because a medicine
 * time is exact and also falls in the night): at each dose time Zaki reminds the people picked,
 * and a dose nobody marked `missed_after_minutes` later is told to the rest of the family. Each
 * is claimed on its care_doses row (reminded_at / alerted_at), so it goes out once even if two
 * ticks overlap, and message client_ids repeat nothing either. Medicine reminders are reminders the
 * family asked for: they never count against Zaki's daily budget and ignore waking hours.
 * Returns how many chat lines were written.
 */
export async function runCareTick(deps: CareTickDeps, now = new Date()): Promise<number> {
  const { prisma } = deps;
  const since = new Date(now.getTime() - TICK_LOOKBACK_MS);
  const meds = await prisma.careMed.findMany({
    where: { active: true },
    include: {
      doses: { where: { dueAt: { gte: since } } },
      circle: { select: { members: { select: { userId: true, user: { select: { language: true } } } } } },
    },
  });
  const notices: Notice[] = [];
  let written = 0;
  for (const med of meds) {
    const from = med.createdAt > since ? med.createdAt : since;
    for (const slot of slotsBetween(med.times, med.timeZone, from, now)) {
      const row = med.doses.find((d) => d.dueAt.getTime() === slot.dueAt.getTime());
      if (row?.status) continue;
      const late = now.getTime() - slot.dueAt.getTime();
      const remind = !row?.remindedAt && late <= REMIND_WINDOW_MS;
      const missedFor = late - med.missedAfterMinutes * 60_000;
      const alert = !row?.alertedAt && doseState(slot.dueAt, null, now, med.missedAfterMinutes) === "missed" && missedFor <= ALERT_WINDOW_MS;
      if (!remind && !alert) continue;
      await prisma.careDose.upsert({ where: { medId_dueAt: { medId: med.id, dueAt: slot.dueAt } }, create: { medId: med.id, dueAt: slot.dueAt }, update: {} });
      const t = slot.dueAt.getTime();
      if (remind) {
        const claimed = await prisma.careDose.updateMany({ where: { medId: med.id, dueAt: slot.dueAt, remindedAt: null, status: null }, data: { remindedAt: now } });
        if (claimed.count) {
          for (const m of med.circle.members.filter((m) => med.remindUserIds.includes(m.userId))) {
            const lang = langOf(m.user);
            const text = remindLine(lang, { self: m.userId === med.personUserId, person: med.personName, name: med.name, dose: med.dose, time: slot.time });
            await postUpdate(prisma, m.userId, `care:${med.id}:${t}:remind`, text, now, [takenCard(lang, med, slot.dueAt)]);
            notices.push({ userId: m.userId, text });
            written++;
          }
        }
      }
      if (alert) {
        const claimed = await prisma.careDose.updateMany({ where: { medId: med.id, dueAt: slot.dueAt, alertedAt: null, status: null }, data: { alertedAt: now } });
        if (claimed.count) {
          // The one who takes it already had the reminder; the rest of the family hears it now.
          for (const m of med.circle.members.filter((m) => m.userId !== med.personUserId)) {
            const lang = langOf(m.user);
            const text = missedLine(lang, { person: med.personName, name: med.name, time: slot.time });
            await postUpdate(prisma, m.userId, `care:${med.id}:${t}:missed`, text, now, [takenCard(lang, med, slot.dueAt)]);
            notices.push({ userId: m.userId, text });
            written++;
          }
        }
      }
    }
  }
  if (notices.length) await pushNotices(prisma, deps.push, notices, deps.log);
  return written;
}
