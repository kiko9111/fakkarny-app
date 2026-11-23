import type { FastifyPluginAsync, preHandlerAsyncHookHandler } from "fastify";
import { z } from "zod";
import { CreateTaskRequest, IftarRequest, RespondTaskRequest, ReviewHomeworkRequest, SubmitHomeworkRequest, RsvpRequest, TaskRemindRequest, type CircleFeedResponse, type ListTasksResponse, type TaskResponse } from "@fakkarni/shared";
import type { PrismaClient, User } from "../generated/prisma/client";
import { pushNotices } from "../proactive/notify";
import type { PushSender } from "../proactive/push";
import { circleExtras, FREE_NUDGES_PER_TASK } from "@fakkarni/shared";
import { hasProAccess } from "../billing/family";
import { canCancel, canFinish, canNudge, canRespond, canSetRemind, postLine } from "../tasks/rules";
import { assignTask, cancel, finish, langOf, nudge, respond, reviewHomework, roleOf, submitHomework, toWireTask, wirePosts, withPeople, type Outcome } from "../tasks/store";

export interface TaskRoutesOptions {
  /** Off (stores not set up yet): every circle keeps its extras. */
  requireSubscription?: boolean;
  prisma: PrismaClient;
  authenticate: preHandlerAsyncHookHandler;
  now?: () => Date;
  push?: PushSender;
}

const IdParam = z.object({ id: z.uuid() });

/** Assigned tasks inside circles, and what Zaki posts there. Free and unlimited. */
export const taskRoutes: FastifyPluginAsync<TaskRoutesOptions> = async (app, opts) => {
  const { prisma } = opts;
  const now = opts.now ?? (() => new Date());
  const proFor = async (user: User): Promise<boolean> => !opts.requireSubscription || (await hasProAccess(prisma, user, now()));
  app.addHook("preHandler", opts.authenticate);

  const isMember = async (circleId: string, userId: string) => Boolean(await prisma.circleMember.findUnique({ where: { circleId_userId: { circleId, userId } } }));
  /** The task, if the caller asked for it or was asked. */
  const mine = async (params: unknown, userId: string) => {
    const p = IdParam.safeParse(params);
    const t = p.success ? await prisma.circleTask.findUnique({ where: { id: p.data.id }, include: withPeople }) : null;
    const role = t ? roleOf(t, userId) : "watcher";
    return t && role !== "watcher" ? { t, role } : null;
  };
  const done = (outcome: Outcome, userId: string): TaskResponse => {
    void pushNotices(prisma, opts.push, outcome.notices, app.log);
    return { task: toWireTask(outcome.task, userId, now()) };
  };

  /** Everything the caller asked for or was asked, newest first. */
  app.get("/tasks", async (req) => {
    const rows = await prisma.circleTask.findMany({
      where: { OR: [{ assignerId: req.user.id }, { assigneeId: req.user.id }], status: { not: "cancelled" } },
      include: withPeople,
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    const at = now();
    return { tasks: rows.map((t) => toWireTask(t, req.user.id, at)) } satisfies ListTasksResponse;
  });

  /**
   * One circle: Zaki's posts, and the tasks the caller may see. Everyone in the circle sees
   * tasks that were accepted; a request still waiting (or declined) stays between the two.
   */
  app.get("/circles/:id/feed", async (req, reply) => {
    const params = IdParam.safeParse(req.params);
    if (!params.success || !(await isMember(params.data.id, req.user.id))) return reply.code(404).send({ error: "not_found" });
    const circleId = params.data.id;
    const [posts, tasks] = await Promise.all([
      prisma.circlePost.findMany({ where: { circleId }, orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.circleTask.findMany({
        where: { circleId, OR: [{ status: { in: ["accepted", "done"] } }, { status: { in: ["pending", "declined"] }, OR: [{ assignerId: req.user.id }, { assigneeId: req.user.id }] }] },
        include: withPeople,
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
    ]);
    const at = now();
    return { posts: await wirePosts(prisma, posts, langOf(req.user), req.user.id), tasks: tasks.map((t) => toWireTask(t, req.user.id, at)) } satisfies CircleFeedResponse;
  });

  /** Iftar invitation to the whole circle (Ramadan pack): a post everyone can answer, plus a push. */
  app.post("/circles/:id/iftar", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const params = IdParam.safeParse(req.params);
    const body = IftarRequest.safeParse(req.body);
    if (!params.success) return reply.code(404).send({ error: "not_found" });
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    const circle = await prisma.circle.findFirst({ where: { id: params.data.id, members: { some: { userId: req.user.id } } }, include: { members: { include: { user: { select: { language: true } } } } } });
    if (!circle) return reply.code(404).send({ error: "not_found" });
    const title = `${body.data.on}|${body.data.note ?? ""}`;
    const post = await prisma.circlePost.create({ data: { circleId: circle.id, event: "iftar", actorId: req.user.id, title, createdAt: now() } });
    await prisma.event.create({ data: { userId: req.user.id, name: "iftar_invite", propsJson: {} } });
    void pushNotices(prisma, opts.push, circle.members.filter((m) => m.userId !== req.user.id).map((m) => ({ userId: m.userId, text: `${circle.name}: ${postLine(langOf(m.user), "iftar", req.user.name, null, title)}` })), app.log);
    return reply.code(201).send({ id: post.id });
  });

  /** Answer an invitation. One answer per person; answering again changes it. */
  app.post("/circles/:id/posts/:postId/rsvp", async (req, reply) => {
    const params = z.object({ id: z.uuid(), postId: z.uuid() }).safeParse(req.params);
    const body = RsvpRequest.safeParse(req.body);
    if (!params.success) return reply.code(404).send({ error: "not_found" });
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    const { id: circleId, postId } = params.data;
    const invite = (await isMember(circleId, req.user.id)) ? await prisma.circlePost.findFirst({ where: { id: postId, circleId, event: "iftar" } }) : null;
    if (!invite) return reply.code(404).send({ error: "not_found" });
    const event = body.data.going ? "rsvp:yes" : "rsvp:no";
    const existing = await prisma.circlePost.findFirst({ where: { circleId, actorId: req.user.id, targetId: postId, event: { startsWith: "rsvp:" } } });
    if (existing) await prisma.circlePost.update({ where: { id: existing.id }, data: { event, createdAt: now() } });
    else await prisma.circlePost.create({ data: { circleId, event, actorId: req.user.id, targetId: postId, createdAt: now() } });
    if (invite.actorId && invite.actorId !== req.user.id && existing?.event !== event) {
      const host = await prisma.user.findUnique({ where: { id: invite.actorId }, select: { id: true, language: true } });
      if (host) void pushNotices(prisma, opts.push, [{ userId: host.id, text: postLine(langOf(host), event, req.user.name, null, null) ?? "" }], app.log);
    }
    return reply.code(204).send();
  });

  app.post("/circles/:id/tasks", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const params = IdParam.safeParse(req.params);
    const body = CreateTaskRequest.safeParse(req.body);
    if (!params.success) return reply.code(404).send({ error: "not_found" });
    if (!body.success || body.data.assignee_id === req.user.id) return reply.code(400).send({ error: "invalid_body" });
    const made = await assignTask(prisma, { circleId: params.data.id, assignerId: req.user.id, assigneeId: body.data.assignee_id, title: body.data.title, dueAt: body.data.due_at ? new Date(body.data.due_at) : null, remindAt: body.data.remind_at ? new Date(body.data.remind_at) : null, homework: body.data.homework ?? false, note: body.data.note || null }, now());
    if (made === "not_members") return reply.code(404).send({ error: "not_found" });
    if (made === "too_many") return reply.code(409).send({ error: "too_many" });
    return reply.code(201).send(done(made, req.user.id));
  });

  app.post("/tasks/:id/respond", async (req, reply) => {
    const found = await mine(req.params, req.user.id);
    const body = RespondTaskRequest.safeParse(req.body);
    if (!found) return reply.code(404).send({ error: "not_found" });
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    const outcome = canRespond(found.t.status, found.role) ? await respond(prisma, found.t.id, body.data.answer, now()) : null;
    if (!outcome) return reply.code(409).send({ error: "not_allowed" });
    return done(outcome, req.user.id);
  });

  /** Change when Zaki reminds the assignee. On an accepted task this moves their own reminder too. */
  app.post("/tasks/:id/remind", async (req, reply) => {
    const found = await mine(req.params, req.user.id);
    const body = TaskRemindRequest.safeParse(req.body);
    if (!found) return reply.code(404).send({ error: "not_found" });
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    if (!canSetRemind(found.t.status, found.role)) return reply.code(409).send({ error: "not_allowed" });
    const remindAt = body.data.remind_at ? new Date(body.data.remind_at) : null;
    const task = await prisma.$transaction(async (tx) => {
      if (found.t.itemId) {
        await tx.item.updateMany({ where: { id: found.t.itemId, userId: found.t.assigneeId }, data: { remindAt: remindAt ?? found.t.dueAt, ...(remindAt || found.t.dueAt ? { type: "reminder" } : {}) } });
      }
      return tx.circleTask.update({ where: { id: found.t.id }, data: { remindAt }, include: withPeople });
    });
    return { task: toWireTask(task, req.user.id, now()) } satisfies TaskResponse;
  });

  app.post("/tasks/:id/done", async (req, reply) => {
    const found = await mine(req.params, req.user.id);
    if (!found) return reply.code(404).send({ error: "not_found" });
    const outcome = canFinish(found.t.status, found.role) ? await finish(prisma, found.t.id, now()) : null;
    if (!outcome) return reply.code(409).send({ error: "not_allowed" });
    return done(outcome, req.user.id);
  });

  /** The child hands in homework (answer or link); the parent hears at once. */
  app.post("/tasks/:id/submit", { bodyLimit: 24 * 1024 * 1024, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const body = SubmitHomeworkRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    const found = await mine(req.params, req.user.id);
    if (!found) return reply.code(404).send({ error: "not_found" });
    const outcome = found.role === "assignee" && found.t.homework ? await submitHomework(prisma, found.t.id, body.data.text, now(), body.data.photos) : null;
    if (!outcome) return reply.code(409).send({ error: "not_allowed" });
    return done(outcome, req.user.id);
  });

  /** The parent: well done, or redo it (with a note). */
  app.post("/tasks/:id/review", async (req, reply) => {
    const body = ReviewHomeworkRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    const found = await mine(req.params, req.user.id);
    if (!found) return reply.code(404).send({ error: "not_found" });
    const outcome = found.role === "assigner" ? await reviewHomework(prisma, found.t.id, body.data.verdict, body.data.note || null, now()) : null;
    if (!outcome) return reply.code(409).send({ error: "not_allowed" });
    return done(outcome, req.user.id);
  });

  app.post("/tasks/:id/cancel", async (req, reply) => {
    const found = await mine(req.params, req.user.id);
    if (!found) return reply.code(404).send({ error: "not_found" });
    const outcome = canCancel(found.t.status, found.role) ? await cancel(prisma, found.t.id, now()) : null;
    if (!outcome) return reply.code(409).send({ error: "not_allowed" });
    return done(outcome, req.user.id);
  });

  /** The assigner asks Zaki to remind the other person (at most every 12 hours, 3 times a task). */
  app.post("/tasks/:id/nudge", async (req, reply) => {
    const found = await mine(req.params, req.user.id);
    if (!found) return reply.code(404).send({ error: "not_found" });
    // After the circle's trial, the first nudge per task stays free; more are a Pro extra.
    if (canNudge(found.t, found.role, now()) && found.t.nudges >= FREE_NUDGES_PER_TASK) {
      const circle = await prisma.circle.findUnique({ where: { id: found.t.circleId }, select: { createdAt: true } });
      if (circle && !circleExtras(circle.createdAt, await proFor(req.user), now())) return reply.code(402).send({ error: "circle_extras" });
    }
    const outcome = canNudge(found.t, found.role, now()) ? await nudge(prisma, found.t, now()) : null;
    if (!outcome) return reply.code(409).send({ error: "not_allowed" });
    return done(outcome, req.user.id);
  });
};
