import type { FastifyPluginAsync, preHandlerAsyncHookHandler } from "fastify";
import { z } from "zod";
import { CreateTaskRequest, RespondTaskRequest, type CircleFeedResponse, type ListTasksResponse, type TaskResponse } from "@fakkarni/shared";
import type { PrismaClient } from "../generated/prisma/client";
import { pushNotices } from "../proactive/notify";
import type { PushSender } from "../proactive/push";
import { canCancel, canFinish, canNudge, canRespond, MAX_OPEN_PER_PAIR } from "../tasks/rules";
import { announce, cancel, finish, langOf, nudge, respond, roleOf, toWireTask, wirePosts, withPeople, type Outcome } from "../tasks/store";

export interface TaskRoutesOptions {
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
    return { posts: await wirePosts(prisma, posts, langOf(req.user)), tasks: tasks.map((t) => toWireTask(t, req.user.id, at)) } satisfies CircleFeedResponse;
  });

  app.post("/circles/:id/tasks", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const params = IdParam.safeParse(req.params);
    const body = CreateTaskRequest.safeParse(req.body);
    if (!params.success) return reply.code(404).send({ error: "not_found" });
    if (!body.success || body.data.assignee_id === req.user.id) return reply.code(400).send({ error: "invalid_body" });
    const circleId = params.data.id;
    // Both people have to be in the circle.
    const members = await prisma.circleMember.count({ where: { circleId, userId: { in: [req.user.id, body.data.assignee_id] } } });
    if (members !== 2) return reply.code(404).send({ error: "not_found" });
    const open = await prisma.circleTask.count({ where: { assignerId: req.user.id, assigneeId: body.data.assignee_id, status: { in: ["pending", "accepted"] } } });
    if (open >= MAX_OPEN_PER_PAIR) return reply.code(409).send({ error: "too_many" });
    const at = now();
    const task = await prisma.circleTask.create({
      data: { circleId, assignerId: req.user.id, assigneeId: body.data.assignee_id, title: body.data.title, dueAt: body.data.due_at ? new Date(body.data.due_at) : null, createdAt: at },
      include: withPeople,
    });
    await prisma.event.create({ data: { userId: req.user.id, name: "task_assigned", propsJson: { has_due: Boolean(task.dueAt) } } });
    return reply.code(201).send(done({ task, notices: await announce(prisma, task, at) }, req.user.id));
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

  app.post("/tasks/:id/done", async (req, reply) => {
    const found = await mine(req.params, req.user.id);
    if (!found) return reply.code(404).send({ error: "not_found" });
    const outcome = canFinish(found.t.status, found.role) ? await finish(prisma, found.t.id, now()) : null;
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
    const outcome = canNudge(found.t, found.role, now()) ? await nudge(prisma, found.t, now()) : null;
    if (!outcome) return reply.code(409).send({ error: "not_allowed" });
    return done(outcome, req.user.id);
  });
};
