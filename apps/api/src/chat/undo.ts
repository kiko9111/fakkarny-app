import { Prisma, type PrismaClient, type User } from "../generated/prisma/client";
import { cancelEntry } from "../daftar/store";
import { visibleTo } from "../money/store";
import { LABEL, type StoredCard } from "./cards";

/** How long a done card can be taken back. */
export const UNDO_WINDOW_MS = 24 * 3600_000;

/**
 * "Undo" on a done card (step 5, 2026-11-23: the user's own changes happen at once, with an
 * Undo instead of a confirm). Only the user's own things carry an undo payload; nothing that
 * reached other people. Returns the card as it is when there is nothing (left) to undo.
 */
export async function undoCard(prisma: PrismaClient, user: User, c: StoredCard, createdAt: Date, now: Date): Promise<StoredCard> {
  if (c.status !== "done" || !c.undo || now.getTime() - createdAt.getTime() > UNDO_WINDOW_MS) return c;
  const u = c.undo;
  const ok = await (async (): Promise<boolean> => {
    switch (u.kind) {
      case "money_entry":
        return (await prisma.moneyEntry.deleteMany({ where: { id: u.entryId, userId: user.id } })).count > 0;
      case "money_entry_restore": {
        const s = await prisma.moneySection.findFirst({ where: { id: u.sectionId, ...visibleTo(user.id) } });
        if (!s) return false;
        await prisma.moneyEntry.create({ data: { sectionId: s.id, userId: user.id, amount: new Prisma.Decimal(u.amount), note: u.note, split: u.split, source: u.source, at: new Date(u.at) } });
        return true;
      }
      case "section": {
        // Only while nothing else was logged in it.
        if (await prisma.moneyEntry.count({ where: { sectionId: u.sectionId } })) return false;
        return (await prisma.moneySection.deleteMany({ where: { id: u.sectionId, ownerId: user.id } })).count > 0;
      }
      case "budget":
        return (await prisma.moneySection.updateMany({ where: { id: u.sectionId, ownerId: user.id }, data: { budget: u.budget === null ? null : new Prisma.Decimal(u.budget) } })).count > 0;
      case "tracker":
        return (await prisma.tracker.deleteMany({ where: { id: u.trackerId, userId: user.id } })).count > 0;
      case "tracker_entry":
        return (await prisma.trackerEntry.deleteMany({ where: { id: u.entryId, tracker: { userId: user.id } } })).count > 0;
      case "tracker_entry_restore": {
        const t = await prisma.tracker.findFirst({ where: { id: u.trackerId, userId: user.id } });
        if (!t) return false;
        await prisma.trackerEntry.create({ data: { trackerId: t.id, amount: new Prisma.Decimal(u.amount), source: u.source, at: new Date(u.at) } });
        return true;
      }
      case "tracker_settings":
        return (await prisma.tracker.updateMany({ where: { id: u.trackerId, userId: user.id }, data: { goal: u.goal === null ? null : new Prisma.Decimal(u.goal), askTimes: u.askTimes } })).count > 0;
      case "circle": {
        // Only while the user is still alone in it (nobody has joined).
        const members = await prisma.circleMember.findMany({ where: { circleId: u.circleId }, select: { userId: true } });
        if (members.length !== 1 || members[0]!.userId !== user.id) return false;
        await prisma.circle.delete({ where: { id: u.circleId } });
        return true;
      }
      case "rename": {
        const me = await prisma.circleMember.findUnique({ where: { circleId_userId: { circleId: u.circleId, userId: user.id } } });
        if (me?.role !== "owner") return false;
        await prisma.circle.update({ where: { id: u.circleId }, data: { name: u.name } });
        return true;
      }
      case "memories":
        await prisma.memory.createMany({ data: u.memories.map((m) => ({ userId: user.id, kind: m.kind as "person" | "place" | "preference" | "fact", subject: m.subject, content: m.content, createdAt: new Date(m.createdAt) })) });
        return true;
      case "user": {
        const d = u.data;
        const data: Prisma.UserUpdateInput = {};
        if ("name" in d) data.name = d.name ?? null;
        if (d.wakeTime) data.wakeTime = d.wakeTime;
        if (d.sleepTime) data.sleepTime = d.sleepTime;
        if ("instapayLink" in d) data.instapayLink = d.instapayLink ?? null;
        if ("gender" in d) data.gender = d.gender ?? null;
        if (d.tone) data.tone = d.tone as "playful" | "balanced" | "calm";
        if (d.checkinIntervalH) data.checkinIntervalH = d.checkinIntervalH as "h2" | "h4" | "off";
        if (!Object.keys(data).length) return false;
        await prisma.user.update({ where: { id: user.id }, data });
        return true;
      }
      case "split":
        // Nobody has added their own items yet.
        return (await prisma.split.deleteMany({ where: { id: u.splitId, userId: user.id, webAdds: 0 } })).count > 0;
      case "split_paid": {
        const s = await prisma.split.findFirst({ where: { id: u.splitId, userId: user.id } });
        const people = s?.peopleJson as { paid: boolean }[] | undefined;
        if (!s || !people?.[u.index]) return false;
        people[u.index]!.paid = false;
        await prisma.split.update({ where: { id: s.id }, data: { peopleJson: people } });
        return true;
      }
      case "daftar_entry": {
        // Not yet seen by anyone: still pending and nobody opened the link.
        const e = await prisma.daftarEntry.findFirst({ where: { id: u.entryId, creatorId: user.id, otherUserId: null, status: "pending" } });
        return e ? cancelEntry(prisma, e.id) : false;
      }
      case "item_status": {
        const r = await prisma.item.updateMany({ where: { id: u.itemId, userId: user.id }, data: { status: u.status } });
        return r.count > 0;
      }
      case "task_remind": {
        const t = await prisma.circleTask.findFirst({ where: { id: u.taskId, OR: [{ assignerId: user.id }, { assigneeId: user.id }] } });
        if (!t) return false;
        const remindAt = u.remindAt ? new Date(u.remindAt) : null;
        await prisma.$transaction(async (tx) => {
          if (t.itemId) await tx.item.updateMany({ where: { id: t.itemId, userId: t.assigneeId }, data: { remindAt: remindAt ?? t.dueAt } });
          await tx.circleTask.update({ where: { id: t.id }, data: { remindAt } });
        });
        return true;
      }
    }
  })().catch(() => false);
  const { undo: _drop, ...rest } = c;
  if (!ok) return { ...rest, label: `${c.label} · ${LABEL.notAllowed(c.lang)}` };
  await prisma.event.create({ data: { userId: user.id, name: "chat_action_undone", propsJson: { kind: c.kind } } });
  return { ...rest, status: "cancelled", label: `${c.label} · ${LABEL.undone(c.lang)}` };
}
