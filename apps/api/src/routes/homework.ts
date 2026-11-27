import type { FastifyPluginAsync, preHandlerAsyncHookHandler } from "fastify";
import { z } from "zod";
import {
  HomeworkBatchRequest,
  HomeworkCheckRequest,
  HomeworkHelpRequest,
  PocketPaidRequest,
  type HomeworkBatchResponse,
  type HomeworkCheckResponse,
  type HomeworkHelpResponse,
  type PocketMoneyResponse,
} from "@fakkarni/shared";
import type { PrismaClient, User } from "../generated/prisma/client";
import { costUsd, FRIEND_MODEL, type FriendModel, type Usage } from "../ai/model";
import { aiAllowanceToday } from "../billing/allowance";
import { assignHomeworkBatch, loadAccounts, recordPaid } from "../homework/store";
import { homeworkAbout } from "../persona/homework";
import { helplineFor } from "../persona/prompt";
import { helplineMessage, looksLikeCrisis } from "../pipeline/rules";
import { pushNotices } from "../proactive/notify";
import type { PushSender } from "../proactive/push";
import { toWireTask, withPeople } from "../tasks/store";

/**
 * Homework, grown up (2026-11-26): pocket money for homework, a week's homework in one go, and
 * Zaki helping (the parent with the lesson, the child with hints). Pocket money is a record:
 * nothing is held or moved. Help and checks are one AI call each, counted like a chat message;
 * the words and photos sent are never stored or logged.
 */
export interface HomeworkRoutesOptions {
  prisma: PrismaClient;
  authenticate: preHandlerAsyncHookHandler;
  model?: FriendModel;
  now?: () => Date;
  push?: PushSender;
  requireSubscription?: boolean;
}

const IdParam = z.object({ id: z.uuid() });
/** Answer checks one child may ask for on one homework in a day (it should stay their work). */
export const MAX_CHECKS_PER_TASK_PER_DAY = 5;

export const homeworkRoutes: FastifyPluginAsync<HomeworkRoutesOptions> = async (app, opts) => {
  const { prisma } = opts;
  const now = opts.now ?? (() => new Date());
  app.addHook("preHandler", opts.authenticate);

  app.get("/pocket-money", async (req) => (await loadAccounts(prisma, req.user.id, now())) satisfies PocketMoneyResponse);

  /** The parent marks pocket money as handed over. Answers with every record, fresh. */
  app.post("/pocket-money/paid", async (req, reply) => {
    const body = PocketPaidRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    const out = await recordPaid(prisma, req.user, { id: body.data.id, circleId: body.data.circle_id, childId: body.data.child_id, amount: body.data.amount }, now());
    if (out === "not_found") return reply.code(404).send({ error: "not_found" });
    // 422, not 409: the phone resends 409s, and this one will never pass as it is.
    if (out === "too_much") return reply.code(422).send({ error: "more_than_owed" });
    void pushNotices(prisma, opts.push, out.notices, app.log);
    return (await loadAccounts(prisma, req.user.id, now())) satisfies PocketMoneyResponse;
  });

  /** A week's homework for one child (parsed on the phone from the school's message). */
  app.post("/circles/:id/homework", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const params = IdParam.safeParse(req.params);
    const body = HomeworkBatchRequest.safeParse(req.body);
    if (!params.success) return reply.code(404).send({ error: "not_found" });
    if (!body.success || body.data.assignee_id === req.user.id) return reply.code(400).send({ error: "invalid_body" });
    const items = body.data.items.map((i) => ({ title: i.title, subject: i.subject || null, dueAt: i.due_at ? new Date(i.due_at) : null, note: i.note || null, reward: i.reward ?? null }));
    const made = await assignHomeworkBatch(prisma, { circleId: params.data.id, assignerId: req.user.id, assigneeId: body.data.assignee_id, items }, now());
    if (made === "not_members") return reply.code(404).send({ error: "not_found" });
    if (made === "too_many") return reply.code(422).send({ error: "too_many" });
    void pushNotices(prisma, opts.push, made.notices, app.log);
    const at = now();
    return reply.code(201).send({ tasks: made.tasks.map((t) => toWireTask(t, req.user.id, at)) } satisfies HomeworkBatchResponse);
  });

  /** Words that look like someone in danger get the helpline, never a homework answer. */
  const crisisCheck = (user: User, text: string): string | null => (text && looksLikeCrisis(text) ? helplineMessage(user.language === "en" ? "english" : "arabic", helplineFor(user.timezone, user.city)) : null);

  const logCall = (user: User, feature: "homework_help" | "homework_check", usage: Usage, photos: number, ok: boolean, extra: Record<string, string> = {}) =>
    prisma.event.createMany({
      data: [
        { userId: user.id, name: "ai_call", propsJson: { purpose: "chat", feature, ...(photos ? { photo: "homework" } : {}), model: FRIEND_MODEL, ...usage, cost_usd: costUsd(usage) } },
        { userId: user.id, name: feature, propsJson: { ok, photos, ...extra } },
      ],
    });

  /** The parent: explain this lesson to me, and give me practice questions for my child. */
  app.post("/homework/help", { bodyLimit: 14 * 1024 * 1024, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const body = HomeworkHelpRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    if (!opts.model?.homeworkHelp) return reply.code(503).send({ error: "unavailable" });
    const user = req.user;
    const task = body.data.task_id ? await prisma.circleTask.findFirst({ where: { id: body.data.task_id, assignerId: user.id, homework: true } }) : null;
    if (body.data.task_id && !task) return reply.code(404).send({ error: "not_found" });
    const at = now();
    const allowance = await aiAllowanceToday(prisma, user, at, opts.requireSubscription);
    const helpline = crisisCheck(user, body.data.text);
    if (helpline) return { help: null, error: null, helpline, ai_allowance: allowance } satisfies HomeworkHelpResponse;
    if (allowance.limit !== null && allowance.used >= allowance.limit) return { help: null, error: "limit", helpline: null, ai_allowance: allowance } satisfies HomeworkHelpResponse;
    let result: Awaited<ReturnType<NonNullable<FriendModel["homeworkHelp"]>>>;
    try {
      result = await opts.model.homeworkHelp({ text: body.data.text, photos: body.data.photos, language: user.language === "en" ? "en" : "ar", about: homeworkAbout(task) });
    } catch {
      return reply.code(503).send({ error: "unavailable" });
    }
    await logCall(user, "homework_help", result.usage, body.data.photos.length, Boolean(result.help), { from: task ? "task" : "free" });
    return { help: result.help, error: result.help ? null : "unreadable", helpline: null, ai_allowance: { limit: allowance.limit, used: allowance.used + 1 } } satisfies HomeworkHelpResponse;
  });

  /** The child: look at my answers before I hand in. Hints only, never the answers. */
  app.post("/tasks/:id/check", { bodyLimit: 14 * 1024 * 1024, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const params = IdParam.safeParse(req.params);
    const body = HomeworkCheckRequest.safeParse(req.body);
    if (!params.success) return reply.code(404).send({ error: "not_found" });
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    if (!opts.model?.homeworkCheck) return reply.code(503).send({ error: "unavailable" });
    const user = req.user;
    const task = await prisma.circleTask.findFirst({ where: { id: params.data.id, assigneeId: user.id, homework: true }, include: withPeople });
    if (!task) return reply.code(404).send({ error: "not_found" });
    if (task.status !== "pending" && task.status !== "accepted") return reply.code(409).send({ error: "not_allowed" });
    const at = now();
    const [allowance, checksToday] = await Promise.all([
      aiAllowanceToday(prisma, user, at, opts.requireSubscription),
      prisma.event.count({ where: { userId: user.id, name: "homework_check", createdAt: { gte: new Date(at.getTime() - 86_400_000) }, propsJson: { path: ["task"], equals: task.id } } }),
    ]);
    const helpline = crisisCheck(user, body.data.text);
    if (helpline) return { check: null, error: null, helpline, ai_allowance: allowance } satisfies HomeworkCheckResponse;
    if (checksToday >= MAX_CHECKS_PER_TASK_PER_DAY) return reply.code(429).send({ error: "too_many_checks" });
    if (allowance.limit !== null && allowance.used >= allowance.limit) return { check: null, error: "limit", helpline: null, ai_allowance: allowance } satisfies HomeworkCheckResponse;
    let result: Awaited<ReturnType<NonNullable<FriendModel["homeworkCheck"]>>>;
    try {
      result = await opts.model.homeworkCheck({ text: body.data.text, photos: body.data.photos, language: user.language === "en" ? "en" : "ar", about: homeworkAbout(task) });
    } catch {
      return reply.code(503).send({ error: "unavailable" });
    }
    await logCall(user, "homework_check", result.usage, body.data.photos.length, Boolean(result.check), { task: task.id });
    return { check: result.check, error: result.check ? null : "unreadable", helpline: null, ai_allowance: { limit: allowance.limit, used: allowance.used + 1 } } satisfies HomeworkCheckResponse;
  });
};
