import { pocketTotals, type PocketAccount, type PocketMoneyResponse } from "@fakkarni/shared";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { postUpdate } from "../daftar/store";
import type { Notice } from "../proactive/notify";
import { MAX_OPEN_PER_PAIR } from "../tasks/rules";
import { langOf, withPeople, type TaskWithPeople } from "../tasks/store";
import { batchLine, paidLine } from "./rules";

type Db = PrismaClient | Prisma.TransactionClient;

/** What the parent still owes the child in one circle (earned − paid). */
export async function balanceOf(db: Db, circleId: string, childId: string, parentId: string): Promise<number> {
  const sums = await db.pocketMoneyEntry.groupBy({ by: ["kind"], where: { circleId, childId, parentId }, _sum: { amount: true } });
  const of = (k: string) => sums.find((s) => s.kind === k)?._sum.amount ?? 0;
  return of("earned") - of("paid");
}

/**
 * Well done on a homework with a reward: one "earned" row per task (a second Well done adds
 * nothing). Returns the child's new balance, or null when it was already credited.
 */
export async function creditReward(tx: Prisma.TransactionClient, t: Pick<TaskWithPeople, "id" | "circleId" | "assigneeId" | "assignerId" | "reward" | "title">, now: Date): Promise<number | null> {
  if (!t.reward || t.reward <= 0) return null;
  const made = await tx.pocketMoneyEntry.createMany({
    data: [{ circleId: t.circleId, childId: t.assigneeId, parentId: t.assignerId, kind: "earned", amount: t.reward, taskId: t.id, title: t.title, createdAt: now }],
    skipDuplicates: true,
  });
  if (made.count === 0) return null;
  await tx.event.create({ data: { userId: t.assignerId, name: "pocket_earned", propsJson: {} } });
  return balanceOf(tx, t.circleId, t.assigneeId, t.assignerId);
}

/** Every pocket-money record the caller is part of, as child or parent. */
export async function loadAccounts(db: Db, userId: string, now: Date): Promise<PocketMoneyResponse> {
  const rows = await db.pocketMoneyEntry.findMany({
    where: { OR: [{ childId: userId }, { parentId: userId }] },
    include: { circle: { select: { name: true } }, child: { select: { name: true } }, parent: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 3000,
  });
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = `${r.circleId}|${r.childId}|${r.parentId}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const accounts: PocketAccount[] = [...groups.values()].map((list) => {
    const first = list[0]!;
    const totals = pocketTotals(
      list.map((r) => ({ kind: r.kind === "paid" ? "paid" : "earned", amount: r.amount, createdAt: r.createdAt })),
      now,
    );
    return {
      circle_id: first.circleId,
      circle_name: first.circle.name,
      child_id: first.childId,
      child_name: first.child.name,
      parent_id: first.parentId,
      parent_name: first.parent.name,
      role: first.childId === userId ? "child" : "parent",
      earned: totals.earned,
      paid: totals.paid,
      balance: totals.balance,
      week_earned: totals.weekEarned,
      entries: list.slice(0, 20).map((r) => ({ id: r.id, kind: r.kind === "paid" ? "paid" : "earned", amount: r.amount, title: r.title, created_at: r.createdAt.toISOString() })),
    };
  });
  return { accounts };
}

/**
 * The parent marks some pocket money as handed over (never more than is owed). A known `id`
 * returns what was already recorded, so a resend from the phone's outbox is harmless.
 */
export async function recordPaid(
  prisma: PrismaClient,
  parent: { id: string; name: string | null },
  input: { id?: string; circleId: string; childId: string; amount: number },
  now: Date,
): Promise<{ notices: Notice[] } | "not_found" | "too_much"> {
  if (input.id) {
    const seen = await prisma.pocketMoneyEntry.findUnique({ where: { id: input.id } });
    if (seen) return seen.parentId === parent.id ? { notices: [] } : "not_found";
  }
  const members = await prisma.circleMember.count({ where: { circleId: input.circleId, userId: { in: [parent.id, input.childId] } } });
  if (members !== 2 || parent.id === input.childId) return "not_found";
  return prisma.$transaction(async (tx) => {
    const owed = await balanceOf(tx, input.circleId, input.childId, parent.id);
    if (input.amount > owed) return "too_much" as const;
    await tx.pocketMoneyEntry.create({ data: { ...(input.id ? { id: input.id } : {}), circleId: input.circleId, childId: input.childId, parentId: parent.id, kind: "paid", amount: input.amount, createdAt: now } });
    const child = await tx.user.findUniqueOrThrow({ where: { id: input.childId }, select: { id: true, language: true } });
    const text = paidLine(langOf(child), parent.name, input.amount, owed - input.amount);
    await postUpdate(tx, child.id, `pocket:paid:${parent.id}:${now.getTime()}`, text, now);
    await tx.event.create({ data: { userId: parent.id, name: "pocket_paid", propsJson: {} } });
    return { notices: [{ userId: child.id, text }] };
  });
}

/**
 * Homework is due at school in the morning, so Zaki reminds the evening before (15 hours ahead
 * of an 08:00 due time). Too late for that: an hour from now, if that is still before it is due.
 */
export function remindBefore(dueAt: Date | null, now: Date): Date | null {
  if (!dueAt) return null;
  const evening = dueAt.getTime() - 15 * 3600_000;
  if (evening > now.getTime()) return new Date(evening);
  const soon = now.getTime() + 3600_000;
  return soon < dueAt.getTime() ? new Date(soon) : null;
}

export interface BatchItem {
  title: string;
  subject: string | null;
  dueAt: Date | null;
  note: string | null;
  reward: number | null;
}

/**
 * A week's homework for one child in one go. Each item is a homework task like any other
 * (handing it in is the child's yes); the child hears about all of them in one chat line.
 */
export async function assignHomeworkBatch(
  prisma: PrismaClient,
  input: { circleId: string; assignerId: string; assigneeId: string; items: BatchItem[] },
  now: Date,
): Promise<{ tasks: TaskWithPeople[]; notices: Notice[] } | "not_members" | "too_many"> {
  if (input.assignerId === input.assigneeId) return "not_members";
  const members = await prisma.circleMember.count({ where: { circleId: input.circleId, userId: { in: [input.assignerId, input.assigneeId] } } });
  if (members !== 2) return "not_members";
  const open = await prisma.circleTask.count({ where: { assignerId: input.assignerId, assigneeId: input.assigneeId, status: { in: ["pending", "accepted"] } } });
  if (open + input.items.length > MAX_OPEN_PER_PAIR) return "too_many";
  return prisma.$transaction(async (tx) => {
    const tasks: TaskWithPeople[] = [];
    for (const [n, i] of input.items.entries()) {
      tasks.push(
        await tx.circleTask.create({
          data: {
            circleId: input.circleId,
            assignerId: input.assignerId,
            assigneeId: input.assigneeId,
            title: i.title,
            dueAt: i.dueAt,
            remindAt: remindBefore(i.dueAt, now),
            homework: true,
            note: i.note,
            subject: i.subject,
            reward: i.reward && i.reward > 0 ? i.reward : null,
            // Keeps the order of the message on screens sorted by time.
            createdAt: new Date(now.getTime() + n),
          },
          include: withPeople,
        }),
      );
    }
    const first = tasks[0]!;
    const reader = first.assignee;
    const text = batchLine(langOf(reader), first.assigner.name, first.circle.name, tasks.map((t) => ({ title: t.title, reward: t.reward })));
    await postUpdate(tx, reader.id, `homework_batch:${input.assignerId}:${now.getTime()}`, text, now);
    await tx.event.create({ data: { userId: input.assignerId, name: "homework_batch", propsJson: { count: tasks.length, rewards: tasks.filter((t) => t.reward).length } } });
    return { tasks, notices: [{ userId: reader.id, text }] };
  });
}
