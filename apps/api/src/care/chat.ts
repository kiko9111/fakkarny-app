import { MARK_WITHIN_HOURS } from "@fakkarni/shared";
import type { PrismaClient, User } from "../generated/prisma/client";
import type { Notice } from "../proactive/notify";
import { langOf } from "../tasks/store";
import { localParts } from "../lib/time";
import { canMark, CARD } from "./rules";
import { isSlot, markDose, visibleMeds } from "./store";

/** "Taken" on a reminder or a missed line, by tap or a plain chat yes. Marking twice is harmless. */
export async function answerDoseCard(prisma: PrismaClient, user: User, medId: string, dueAt: Date, now: Date): Promise<{ ok: boolean; label: string; notices: Notice[] }> {
  const lang = langOf(user);
  const med = await prisma.careMed.findFirst({ where: { id: medId, ...visibleMeds(user.id) } });
  if (!med || !isSlot(med, dueAt, now)) return { ok: false, label: CARD.gone(lang), notices: [] };
  if (!canMark(dueAt, now, MARK_WITHIN_HOURS)) return { ok: false, label: CARD.late(lang), notices: [] };
  const p = localParts(dueAt, med.timeZone);
  const time = `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
  const notices = await markDose(prisma, med, dueAt, "taken", { id: user.id, name: user.name }, time, now);
  return { ok: true, label: CARD.done(lang), notices };
}
