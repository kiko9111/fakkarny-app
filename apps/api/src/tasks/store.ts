import { PHOTO_KEEP_DAYS, type CirclePost as WirePost, type CircleTask as WireTask, type PhotoUpload, type TaskRole } from "@fakkarni/shared";
import type { CirclePost, CircleTask, Prisma, PrismaClient, User } from "../generated/prisma/client";
import { postUpdate } from "../daftar/store";
import { activityCard, LABEL } from "../chat/cards";
import type { Notice } from "../proactive/notify";
import { zakiCommentLine } from "../circles/zaki";
import { canNudge, homeworkLine, MAX_OPEN_PER_PAIR, postLine, taskLine, type Lang, type TaskEvent } from "./rules";

type Db = PrismaClient | Prisma.TransactionClient;
type Person = Pick<User, "id" | "name" | "language">;
export type TaskWithPeople = CircleTask & { assigner: Person; assignee: Person; circle: { name: string }; photos: { id: string }[] };

const person = { select: { id: true, name: true, language: true } } as const;
const photoCount = (lang: Lang, n: number) => (lang === "en" ? `${n} ${n === 1 ? "photo" : "photos"}` : n === 1 ? "صورة" : `${n} صور`);

export const withPeople = { assigner: person, assignee: person, circle: { select: { name: true } }, photos: { select: { id: true }, orderBy: { createdAt: "asc" } } } as const;
export const langOf = (u: { language: string }): Lang => (u.language === "en" ? "en" : "ar");

export const roleOf = (t: Pick<CircleTask, "assignerId" | "assigneeId">, userId: string): TaskRole => (t.assignerId === userId ? "assigner" : t.assigneeId === userId ? "assignee" : "watcher");

export function toWireTask(t: TaskWithPeople, viewerId: string, now: Date): WireTask {
  const role = roleOf(t, viewerId);
  return {
    id: t.id,
    circle_id: t.circleId,
    circle_name: t.circle.name,
    title: t.title,
    due_at: t.dueAt?.toISOString() ?? null,
    remind_at: t.remindAt?.toISOString() ?? null,
    homework: t.homework,
    note: t.note,
    submission: t.submission,
    submitted_at: t.submittedAt?.toISOString() ?? null,
    photo_ids: t.photos.map((p) => p.id),
    review: t.review === "approved" || t.review === "redo" ? t.review : null,
    review_note: t.reviewNote,
    status: t.status,
    role,
    assigner_name: t.assigner.name,
    assignee_name: t.assignee.name,
    can_nudge: canNudge(t, role, now),
    created_at: t.createdAt.toISOString(),
    responded_at: t.respondedAt?.toISOString() ?? null,
    done_at: t.doneAt?.toISOString() ?? null,
  };
}

/** How many comments a feed item carries inline (the newest ones). */
const INLINE_COMMENTS = 20;

/** Zaki's circle posts, written for this reader, with reactions and the latest comments. Names come from the people as they are now. */
export async function wirePosts(db: Db, posts: CirclePost[], lang: Lang, viewerId?: string): Promise<WirePost[]> {
  // The viewer's own answers to invitations (an rsvp post keeps the invitation's id in targetId).
  const mine = new Map(posts.filter((p) => p.event.startsWith("rsvp:") && p.actorId === viewerId && p.targetId).map((p) => [p.targetId!, p.event === "rsvp:yes"]));
  const postIds = posts.map((p) => p.id);
  const [reactions, comments, counts] = postIds.length
    ? await Promise.all([
        db.postReaction.findMany({ where: { postId: { in: postIds } }, select: { postId: true, userId: true, key: true } }),
        db.postComment.findMany({ where: { postId: { in: postIds } }, orderBy: { createdAt: "desc" }, take: postIds.length * INLINE_COMMENTS }),
        db.postComment.groupBy({ by: ["postId"], where: { postId: { in: postIds } }, _count: { _all: true } }),
      ])
    : [[], [], []];
  const ids = [...new Set([...posts.flatMap((p) => [p.actorId, p.targetId]), ...comments.map((c) => c.userId)].filter((id): id is string => Boolean(id)))];
  const names = new Map((await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const countOf = new Map(counts.map((c) => [c.postId, c._count._all]));
  return posts.flatMap((p) => {
    const text = postLine(lang, p.event, p.actorId ? names.get(p.actorId) : null, p.targetId ? names.get(p.targetId) : null, p.title);
    if (!text) return [];
    const iftar = p.event === "iftar";
    const mineHere = reactions.filter((r) => r.postId === p.id);
    const byKey = new Map<string, number>();
    for (const r of mineHere) byKey.set(r.key, (byKey.get(r.key) ?? 0) + 1);
    const here = comments
      .filter((c) => c.postId === p.id)
      .slice(0, INLINE_COMMENTS)
      .reverse()
      .flatMap((c) => {
        const line = c.userId ? c.text : c.zakiEvent ? zakiCommentLine(lang, c.zakiEvent) : null;
        return line ? [{ id: c.id, author_name: c.userId ? names.get(c.userId) ?? null : null, is_mine: c.userId === viewerId, is_zaki: !c.userId, text: line, created_at: c.createdAt.toISOString() }] : [];
      });
    return [
      {
        id: p.id,
        text,
        created_at: p.createdAt.toISOString(),
        kind: iftar ? ("iftar" as const) : null,
        my_rsvp: iftar ? mine.get(p.id) ?? null : null,
        reactions: [...byKey].map(([key, count]) => ({ key, count })),
        my_reaction: mineHere.find((r) => r.userId === viewerId)?.key ?? null,
        comments: here,
        comment_count: countOf.get(p.id) ?? 0,
      },
    ];
  });
}

const post = (db: Db, t: CircleTask, event: TaskEvent, now: Date) =>
  db.circlePost.create({ data: { circleId: t.circleId, event, actorId: t.assigneeId, targetId: t.assignerId, title: t.title, createdAt: now } });

/** Tell one of the two people, in their own chat and language. Returns the notice to push. */
async function tell(db: Db, t: TaskWithPeople, to: "assigner" | "assignee", kind: Parameters<typeof taskLine>[1], key: string, now: Date): Promise<Notice> {
  const reader = to === "assigner" ? t.assigner : t.assignee;
  const about = to === "assigner" ? t.assignee : t.assigner;
  const text = taskLine(langOf(reader), kind, about.name, t.title, t.circle.name);
  // A new request is answered right under it: Yes accepts, No declines (also a plain yes/no in the chat).
  const lang = langOf(reader) === "en" ? "english" : "arabic";
  const cards = kind === "asked" ? [activityCard(lang, "task_answer", LABEL.taskRequestCard(lang, t.title), `/circle/${t.circleId}`, { kind: "task_answer", taskId: t.id, answer: "accept" }, { kind: "task_answer", taskId: t.id, answer: "decline" })] : [];
  await postUpdate(db, reader.id, `task:${t.id}:${key}`, text, now, cards as unknown as Prisma.InputJsonValue[]);
  return { userId: reader.id, text };
}

export interface Outcome {
  task: TaskWithPeople;
  notices: Notice[];
}

/** A new request: only the person asked hears about it (the circle sees nothing until a yes). */
export async function announce(db: Db, t: TaskWithPeople, now: Date): Promise<Notice[]> {
  return [await tell(db, t, "assignee", "asked", "asked", now)];
}

/**
 * The person asked says yes or no. On yes the task becomes one of their own items, so their
 * reminders, Upcoming tab and Zaki's follow-ups treat it like anything else they said.
 */
export async function respond(prisma: PrismaClient, taskId: string, answer: "accept" | "decline", now: Date): Promise<Outcome | null> {
  return prisma.$transaction(async (tx) => {
    const status = answer === "accept" ? "accepted" : "declined";
    const changed = await tx.circleTask.updateMany({ where: { id: taskId, status: "pending" }, data: { status, respondedAt: now } });
    if (changed.count === 0) return null;
    let t = await tx.circleTask.findUniqueOrThrow({ where: { id: taskId }, include: withPeople });
    if (status === "accepted") {
      const item = await tx.item.create({
        data: { userId: t.assigneeId, type: t.dueAt || t.remindAt ? "reminder" : "task", title: t.title, dueAt: t.dueAt, remindAt: t.remindAt ?? t.dueAt, createdAt: now },
      });
      t = await tx.circleTask.update({ where: { id: t.id }, data: { itemId: item.id }, include: withPeople });
      await post(tx, t, "task_accepted", now);
    }
    const notices = [await tell(tx, t, "assigner", status, status, now)];
    await tx.event.create({ data: { userId: t.assigneeId, name: `task_${status}`, propsJson: {} } });
    return { task: t, notices };
  });
}

/** Finish an accepted task (and its item). Used by the task screen and when the item itself is marked done. */
async function finishIn(tx: Prisma.TransactionClient, where: Prisma.CircleTaskWhereInput, now: Date): Promise<Outcome[]> {
  const open = await tx.circleTask.findMany({ where: { ...where, status: "accepted" }, include: withPeople });
  const out: Outcome[] = [];
  for (const row of open) {
    const changed = await tx.circleTask.updateMany({ where: { id: row.id, status: "accepted" }, data: { status: "done", doneAt: now } });
    if (changed.count === 0) continue;
    if (row.itemId) await tx.item.updateMany({ where: { id: row.itemId, status: "open" }, data: { status: "done", doneAt: now } });
    const t = { ...row, status: "done" as const, doneAt: now };
    await post(tx, t, "task_done", now);
    out.push({ task: t, notices: [await tell(tx, t, "assigner", "done", "done", now)] });
    await tx.event.create({ data: { userId: t.assigneeId, name: "task_done", propsJson: {} } });
  }
  return out;
}

export async function finish(prisma: PrismaClient, taskId: string, now: Date): Promise<Outcome | null> {
  return (await prisma.$transaction((tx) => finishIn(tx, { id: taskId }, now)))[0] ?? null;
}

/** The assignee marked their own item done (in a list, or by telling Zaki): the task is done too. */
export async function finishForItems(tx: Prisma.TransactionClient, itemIds: string[], now: Date): Promise<Notice[]> {
  if (itemIds.length === 0) return [];
  return (await finishIn(tx, { itemId: { in: itemIds } }, now)).flatMap((o) => o.notices);
}

/** The assigner no longer needs it. An accepted task also leaves the other person's list. */
export async function cancel(prisma: PrismaClient, taskId: string, now: Date): Promise<Outcome | null> {
  return prisma.$transaction(async (tx) => {
    const before = await tx.circleTask.findUnique({ where: { id: taskId }, include: withPeople });
    if (!before) return null;
    const changed = await tx.circleTask.updateMany({ where: { id: taskId, status: { in: ["pending", "accepted"] } }, data: { status: "cancelled" } });
    if (changed.count === 0) return null;
    if (before.itemId) await tx.item.updateMany({ where: { id: before.itemId, status: "open" }, data: { status: "cancelled" } });
    const t = { ...before, status: "cancelled" as const };
    return { task: t, notices: [await tell(tx, t, "assignee", "cancelled", "cancelled", now)] };
  });
}

/** The assigner asks Zaki to remind the other person. Zaki never does this on its own for a pending task. */
export async function nudge(prisma: PrismaClient, t: TaskWithPeople, now: Date): Promise<Outcome | null> {
  return prisma.$transaction(async (tx) => {
    // Guarded on the counter so two taps cannot send two nudges.
    const changed = await tx.circleTask.updateMany({ where: { id: t.id, nudges: t.nudges, status: t.status }, data: { nudges: { increment: 1 }, lastNudgeAt: now } });
    if (changed.count === 0) return null;
    const task = { ...t, nudges: t.nudges + 1, lastNudgeAt: now };
    const notice = await tell(tx, task, "assignee", t.status === "pending" ? "nudge_pending" : "nudge_accepted", `nudge:${task.nudges}`, now);
    await tx.event.create({ data: { userId: t.assignerId, name: "task_nudged", propsJson: { status: t.status } } });
    return { task, notices: [notice] };
  });
}

/**
 * Ask a circle member to do something (accept first: only the two people hear about it until
 * the assignee says yes). Used by POST /circles/:id/tasks and by the chat (chat/actions.ts).
 */
export async function assignTask(
  prisma: PrismaClient,
  input: { circleId: string; assignerId: string; assigneeId: string; title: string; dueAt: Date | null; remindAt: Date | null; homework: boolean; note: string | null },
  now: Date,
): Promise<Outcome | "not_members" | "too_many"> {
  if (input.assignerId === input.assigneeId) return "not_members";
  // Both people have to be in the circle.
  const members = await prisma.circleMember.count({ where: { circleId: input.circleId, userId: { in: [input.assignerId, input.assigneeId] } } });
  if (members !== 2) return "not_members";
  const open = await prisma.circleTask.count({ where: { assignerId: input.assignerId, assigneeId: input.assigneeId, status: { in: ["pending", "accepted"] } } });
  if (open >= MAX_OPEN_PER_PAIR) return "too_many";
  const task = await prisma.circleTask.create({
    data: { circleId: input.circleId, assignerId: input.assignerId, assigneeId: input.assigneeId, title: input.title, dueAt: input.dueAt, remindAt: input.remindAt, homework: input.homework, note: input.note, createdAt: now },
    include: withPeople,
  });
  await prisma.event.create({ data: { userId: input.assignerId, name: "task_assigned", propsJson: { has_due: Boolean(task.dueAt), has_remind: Boolean(task.remindAt), homework: task.homework } } });
  return { task, notices: await announce(prisma, task, now) };
}

/**
 * The child hands in homework (text answer or link). Still waiting? Handing in is the yes. The
 * task (and its item) is done, and the parent hears at once in their chat, with a push.
 */
export async function submitHomework(prisma: PrismaClient, taskId: string, text: string, now: Date, photos: PhotoUpload[] = []): Promise<Outcome | null> {
  return prisma.$transaction(async (tx) => {
    const changed = await tx.circleTask.updateMany({
      where: { id: taskId, homework: true, status: { in: ["pending", "accepted"] } },
      data: { status: "done", doneAt: now, respondedAt: now, submission: text, submittedAt: now, review: null, reviewNote: null },
    });
    if (changed.count === 0) return null;
    // A new hand-in (after a redo) replaces the old pages.
    await tx.photo.deleteMany({ where: { taskId } });
    if (photos.length) {
      const owner = await tx.circleTask.findUniqueOrThrow({ where: { id: taskId }, select: { assigneeId: true } });
      const expiresAt = new Date(now.getTime() + PHOTO_KEEP_DAYS * 86_400_000);
      for (const [n, p] of photos.entries()) {
        const data = Buffer.from(p.data.replace(/\s+/g, ""), "base64");
        await tx.photo.create({ data: { userId: owner.assigneeId, taskId, mime: p.mime, data, bytes: data.length, createdAt: new Date(now.getTime() + n), expiresAt } });
      }
    }
    const t = await tx.circleTask.findUniqueOrThrow({ where: { id: taskId }, include: withPeople });
    if (t.itemId) await tx.item.updateMany({ where: { id: t.itemId, status: "open" }, data: { status: "done", doneAt: now } });
    await post(tx, t, "task_done", now);
    const reader = t.assigner;
    const line = homeworkLine(langOf(reader), "submitted", t.assignee.name, t.title, text ? text.slice(0, 300) : photoCount(langOf(reader), photos.length));
    // The parent answers right there: Yes = well done, No = do it again.
    const lang = langOf(reader) === "en" ? "english" : "arabic";
    const card = activityCard(lang, "homework_review", LABEL.homeworkCard(lang, t.assignee.name ?? "?"), `/circle/${t.circleId}`, { kind: "homework_review", taskId: t.id, verdict: "approved", note: null }, { kind: "homework_review", taskId: t.id, verdict: "redo", note: null });
    await postUpdate(tx, reader.id, `task:${t.id}:submitted:${now.getTime()}`, line, now, [card as unknown as Prisma.InputJsonValue]);
    await tx.event.create({ data: { userId: t.assigneeId, name: "homework_submitted", propsJson: { photos: photos.length } } });
    return { task: t, notices: [{ userId: reader.id, text: line }] };
  });
}

/** The parent's review: well done, or redo (back on the child's list, with the parent's note). */
export async function reviewHomework(prisma: PrismaClient, taskId: string, verdict: "approved" | "redo", note: string | null, now: Date): Promise<Outcome | null> {
  return prisma.$transaction(async (tx) => {
    const data = verdict === "approved" ? { review: "approved", reviewNote: note } : { review: "redo", reviewNote: note, status: "accepted" as const, doneAt: null };
    const changed = await tx.circleTask.updateMany({ where: { id: taskId, homework: true, status: "done", submittedAt: { not: null } }, data });
    if (changed.count === 0) return null;
    const t = await tx.circleTask.findUniqueOrThrow({ where: { id: taskId }, include: withPeople });
    if (verdict === "redo" && t.itemId) await tx.item.updateMany({ where: { id: t.itemId }, data: { status: "open", doneAt: null, updatedAt: now } });
    const reader = t.assignee;
    const line = homeworkLine(langOf(reader), verdict, t.assigner.name, t.title, note);
    await postUpdate(tx, reader.id, `task:${t.id}:${verdict}:${now.getTime()}`, line, now);
    await tx.event.create({ data: { userId: t.assignerId, name: `homework_${verdict}`, propsJson: {} } });
    return { task: t, notices: [{ userId: reader.id, text: line }] };
  });
}
