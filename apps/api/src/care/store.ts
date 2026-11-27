import type { CareDay, CareDose, CareMed } from "@fakkarni/shared";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { activityCard } from "../chat/cards";
import { postUpdate } from "../daftar/store";
import type { Notice } from "../proactive/notify";
import { langOf } from "../tasks/store";
import { addDays, CARD, careRoute, doseState, localDate, markedLine, slotsBetween, slotsOn, type Slot } from "./rules";

type Db = PrismaClient | Prisma.TransactionClient;
const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;

/** What a medicine's screen needs: its circle (name, members), and the marks of the last 8 days. */
export const medInclude = (now: Date) =>
  ({
    circle: { select: { name: true, members: { select: { userId: true, role: true } } } },
    doses: { where: { dueAt: { gte: new Date(now.getTime() - (WEEK_DAYS + 2) * DAY_MS) } }, include: { byUser: { select: { name: true } } } },
  }) satisfies Prisma.CareMedInclude;

export type MedRow = Prisma.CareMedGetPayload<{ include: ReturnType<typeof medInclude> }>;
type DoseRow = MedRow["doses"][number];

/** The medicines of every circle the user is in. */
export const visibleMeds = (userId: string): Prisma.CareMedWhereInput => ({ circle: { members: { some: { userId } } } });

const key = (d: Date) => d.getTime();

function wireDose(slot: Slot, row: DoseRow | undefined, med: Pick<MedRow, "missedAfterMinutes">, viewerId: string, now: Date): CareDose {
  const state = doseState(slot.dueAt, row?.status, now, med.missedAfterMinutes);
  const marked = state === "taken" || state === "skipped";
  return {
    due_at: slot.dueAt.toISOString(),
    time: slot.time,
    state,
    by_name: marked ? row?.byUser?.name ?? null : null,
    by_me: marked && row?.byUserId === viewerId,
    marked_at: marked ? row?.markedAt?.toISOString() ?? null : null,
  };
}

/** A dose is shown only from the moment the medicine was added (an 8 AM dose of a medicine added at noon is not "missed"), unless someone marked it. */
const counts = (slot: Slot, row: DoseRow | undefined, med: Pick<MedRow, "createdAt">) => Boolean(row?.status) || slot.dueAt >= med.createdAt;

export function toWireMed(med: MedRow, viewerId: string, now: Date): CareMed {
  const rows = new Map(med.doses.map((d) => [key(d.dueAt), d]));
  const tz = med.timeZone;
  const today = localDate(now, tz);
  const todaySlots = slotsOn(today, med.times, tz).filter((s) => counts(s, rows.get(key(s.dueAt)), med));
  const startOfToday = slotsOn(today, ["00:00"], tz)[0]!.dueAt;
  const dose = (s: Slot) => wireDose(s, rows.get(key(s.dueAt)), med, viewerId, now);
  const earlier = slotsBetween(med.times, tz, new Date(now.getTime() - DAY_MS), new Date(startOfToday.getTime() - 1))
    .filter((s) => counts(s, rows.get(key(s.dueAt)), med))
    .map(dose)
    .filter((d) => d.state === "missed");
  const week = { taken: 0, skipped: 0, missed: 0 };
  const weekStart = slotsOn(addDays(today, -WEEK_DAYS), ["00:00"], tz)[0]!.dueAt;
  for (const s of slotsBetween(med.times, tz, weekStart, new Date(startOfToday.getTime() - 1))) {
    if (!counts(s, rows.get(key(s.dueAt)), med)) continue;
    const st = dose(s).state;
    if (st === "taken" || st === "skipped" || st === "missed") week[st]++;
  }
  const member = med.circle.members.find((m) => m.userId === viewerId);
  return {
    id: med.id,
    circle_id: med.circleId,
    circle_name: med.circle.name,
    person_name: med.personName,
    person_user_id: med.personUserId,
    for_me: med.personUserId === viewerId,
    name: med.name,
    dose: med.dose,
    times: med.times,
    time_zone: tz,
    remind_user_ids: med.remindUserIds,
    missed_after_minutes: med.missedAfterMinutes,
    note: med.note,
    active: med.active,
    can_delete: med.createdById === viewerId || member?.role === "owner",
    created_at: med.createdAt.toISOString(),
    today: todaySlots.map(dose),
    open_missed: med.active ? earlier : [],
    week,
  };
}

/** The last 7 days and today, newest first (GET /care/meds/:id/history). */
export function historyOf(med: MedRow, viewerId: string, now: Date): CareDay[] {
  const rows = new Map(med.doses.map((d) => [key(d.dueAt), d]));
  const today = localDate(now, med.timeZone);
  const days: CareDay[] = [];
  for (let i = 0; i <= WEEK_DAYS; i++) {
    const date = addDays(today, -i);
    const doses = slotsOn(date, med.times, med.timeZone)
      .filter((s) => counts(s, rows.get(key(s.dueAt)), med))
      .map((s) => wireDose(s, rows.get(key(s.dueAt)), med, viewerId, now));
    if (doses.length) days.push({ date, doses });
  }
  return days;
}

export async function readMed(prisma: Db, userId: string, id: string, now: Date): Promise<CareMed | null> {
  const med = await prisma.careMed.findFirst({ where: { id, ...visibleMeds(userId) }, include: medInclude(now) });
  return med ? toWireMed(med, userId, now) : null;
}

/** Is this one of the medicine's dose times (within a day either side of now)? */
export function isSlot(med: Pick<MedRow, "times" | "timeZone">, dueAt: Date, now: Date): boolean {
  return slotsBetween(med.times, med.timeZone, new Date(now.getTime() - 2 * DAY_MS), new Date(now.getTime() + 2 * DAY_MS)).some((s) => key(s.dueAt) === key(dueAt));
}

type MarkMed = Pick<MedRow, "id" | "circleId" | "personName" | "personUserId" | "name">;

/**
 * Mark a dose taken / skipped, or take the mark back ("open"). When the family had been told it
 * was missed, they hear that it was marked (chat line + push, as `notices`).
 */
export async function markDose(prisma: PrismaClient, med: MarkMed, dueAt: Date, status: "taken" | "skipped" | "open", by: { id: string; name: string | null }, time: string, now: Date): Promise<Notice[]> {
  const mark = status === "open" ? { status: null, byUserId: null, markedAt: null } : { status, byUserId: by.id, markedAt: now };
  const row = await prisma.careDose.upsert({ where: { medId_dueAt: { medId: med.id, dueAt } }, create: { medId: med.id, dueAt, ...mark }, update: mark });
  if (status === "open" || !row.alertedAt) return [];
  const members = await prisma.circleMember.findMany({ where: { circleId: med.circleId, userId: { not: by.id } }, select: { userId: true, user: { select: { language: true } } } });
  const notices: Notice[] = [];
  for (const m of members) {
    const text = markedLine(langOf(m.user), { person: med.personName, name: med.name, time, by: by.name, status });
    await postUpdate(prisma, m.userId, `care:${med.id}:${key(dueAt)}:${status}`, text, now);
    notices.push({ userId: m.userId, text });
  }
  return notices;
}

/** The "Taken" card on a reminder or a missed line (a plain "yes" in the chat answers it too). */
export function takenCard(lang: "ar" | "en", med: { id: string; circleId: string }, dueAt: Date) {
  return activityCard(lang === "en" ? "english" : "arabic", "care_taken", CARD.ask(lang), careRoute(med.circleId), { kind: "care_dose", medId: med.id, dueAt: dueAt.toISOString(), status: "taken" }) as unknown as Prisma.InputJsonValue;
}
