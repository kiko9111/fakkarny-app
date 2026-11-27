import { linkTaskNext, type LinkTask as WireLinkTask, type LinkTaskAnswer, type LinkTaskStatus } from "@fakkarni/shared";
import type { LinkTask, Prisma, PrismaClient } from "../generated/prisma/client";
import { postUpdate } from "../daftar/store";
import type { Notice } from "../proactive/notify";
import { langOf } from "../tasks/store";
import { taskUpdateLine } from "./rules";

type Db = PrismaClient | Prisma.TransactionClient;

export const taskLinkUrl = (base: string, code: string) => `${base}/t/${code}`;
export const listLinkUrl = (base: string, code: string) => `${base}/l/${code}`;

export function toWireLinkTask(t: LinkTask, base: string): WireLinkTask {
  return {
    id: t.id,
    code: t.code,
    url: taskLinkUrl(base, t.code),
    circle_id: t.circleId,
    other_name: t.otherName,
    title: t.title,
    note: t.note,
    due_at: t.dueAt?.toISOString() ?? null,
    status: t.status as LinkTaskStatus,
    responded_at: t.respondedAt?.toISOString() ?? null,
    done_at: t.doneAt?.toISOString() ?? null,
    seen: t.webViews > 0,
    created_at: t.createdAt.toISOString(),
  };
}

/**
 * The person holding the link answers. Only a step `linkTaskNext` allows is applied, and only
 * once (the status in the WHERE). The creator hears it in their chat and by push.
 */
export async function answerLinkTask(
  prisma: PrismaClient,
  task: LinkTask,
  answer: LinkTaskAnswer,
  now: Date,
): Promise<{ task: LinkTask; notices: Notice[] } | null> {
  const next = linkTaskNext(task.status as LinkTaskStatus, answer);
  if (!next) return null;
  return prisma.$transaction(async (tx) => {
    const changed = await tx.linkTask.updateMany({
      where: { id: task.id, status: task.status },
      data: { status: next, ...(answer === "done" ? { doneAt: now } : {}), respondedAt: task.respondedAt ?? now, updatedAt: now },
    });
    if (!changed.count) return null;
    const row = await tx.linkTask.findUniqueOrThrow({ where: { id: task.id } });
    const creator = await tx.user.findUnique({ where: { id: row.creatorId }, select: { id: true, language: true } });
    const notices: Notice[] = [];
    if (creator) {
      const text = taskUpdateLine(langOf(creator), next, row.otherName, row.title);
      await postUpdate(tx, creator.id, `linktask:${row.id}:${next}`, text, now);
      notices.push({ userId: creator.id, text });
    }
    await tx.event.create({ data: { userId: row.creatorId, name: `link_task_${next}`, propsJson: { via: "web" } } });
    return { task: row, notices };
  });
}

export const openLinkTasks = (db: Db, creatorId: string) =>
  db.linkTask.count({ where: { creatorId, status: { in: ["pending", "accepted"] } } });
