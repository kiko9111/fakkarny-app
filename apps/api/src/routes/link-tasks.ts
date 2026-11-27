import type { FastifyPluginAsync, preHandlerAsyncHookHandler } from "fastify";
import { z } from "zod";
import { CreateLinkTaskRequest, linkTaskCancellable, linkTaskShareable, MAX_OPEN_LINK_TASKS, type LinkTaskResponse, type LinkTaskStatus } from "@fakkarni/shared";
import type { LinkTask, PrismaClient, User } from "../generated/prisma/client";
import { inBackground } from "../lib/background";
import { taskNudgeText, taskShareText, whenText, type Lang } from "../links/rules";
import { openLinkTasks, taskLinkUrl, toWireLinkTask } from "../links/store";
import { withFreshCode } from "../web/link-page";
import { baseUrl } from "./circles";

export interface LinkTaskRoutesOptions {
  prisma: PrismaClient;
  authenticate: preHandlerAsyncHookHandler;
  now?: () => Date;
  publicUrl?: string;
}

const IdParam = z.object({ id: z.uuid() });
const ListQuery = z.object({ circle: z.uuid().optional() });

/**
 * Tasks for people who are not on Zaki: the creator makes one, sends the link from their own
 * WhatsApp, and the other person answers on GET /t/:code. Only the creator sees them in the app.
 * Free; no AI call.
 */
export const linkTaskRoutes: FastifyPluginAsync<LinkTaskRoutesOptions> = async (app, opts) => {
  const { prisma } = opts;
  const now = opts.now ?? (() => new Date());
  app.addHook("preHandler", opts.authenticate);

  const langOf = (u: { language: string }): Lang => (u.language === "en" ? "en" : "ar");
  const shareText = (user: User, t: LinkTask, base: string): string | null => {
    const url = taskLinkUrl(base, t.code);
    const lang = langOf(user);
    if (t.status === "pending") return taskShareText({ lang, otherName: t.otherName, title: t.title, when: t.dueAt ? whenText(t.dueAt, user.timezone, lang) : null, url });
    if (t.status === "accepted") return taskNudgeText({ lang, otherName: t.otherName, title: t.title, url });
    return null;
  };

  app.get("/link-tasks", async (req, reply) => {
    const q = ListQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "invalid_query" });
    const rows = await prisma.linkTask.findMany({
      where: { creatorId: req.user.id, status: { not: "cancelled" }, ...(q.data.circle ? { circleId: q.data.circle } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const base = baseUrl(req, opts.publicUrl);
    return { tasks: rows.map((t) => toWireLinkTask(t, base)) };
  });

  app.post("/link-tasks", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const body = CreateLinkTaskRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    const b = body.data;
    const base = baseUrl(req, opts.publicUrl);
    if (b.id) {
      const known = await prisma.linkTask.findUnique({ where: { id: b.id } });
      if (known) {
        if (known.creatorId !== req.user.id) return reply.code(422).send({ error: "taken" });
        return reply.code(200).send({ task: toWireLinkTask(known, base), share_text: shareText(req.user, known, base) } satisfies LinkTaskResponse);
      }
    }
    if (b.circle_id && !(await prisma.circleMember.count({ where: { circleId: b.circle_id, userId: req.user.id } }))) return reply.code(422).send({ error: "invalid_circle" });
    if ((await openLinkTasks(prisma, req.user.id)) >= MAX_OPEN_LINK_TASKS) return reply.code(422).send({ error: "too_many" });
    const at = now();
    const row = await withFreshCode((code) =>
      prisma.linkTask.create({
        data: {
          ...(b.id ? { id: b.id } : {}),
          code,
          creatorId: req.user.id,
          circleId: b.circle_id ?? null,
          otherName: b.other_name,
          title: b.title,
          note: b.note || null,
          dueAt: b.due_at ? new Date(b.due_at) : null,
          createdAt: at,
          updatedAt: at,
        },
      }),
    );
    inBackground(prisma.event.create({ data: { userId: req.user.id, name: "link_task_created", propsJson: { in_circle: Boolean(b.circle_id), due: Boolean(b.due_at) } } }));
    return reply.code(201).send({ task: toWireLinkTask(row, base), share_text: shareText(req.user, row, base) } satisfies LinkTaskResponse);
  });

  /** The WhatsApp text again: the ask while pending, a gentle reminder once accepted. */
  app.post("/link-tasks/:id/share", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    const row = p.success ? await prisma.linkTask.findFirst({ where: { id: p.data.id, creatorId: req.user.id } }) : null;
    if (!row || row.status === "cancelled") return reply.code(404).send({ error: "not_found" });
    if (!linkTaskShareable(row.status as LinkTaskStatus)) return reply.code(422).send({ error: "not_allowed" });
    const base = baseUrl(req, opts.publicUrl);
    return { task: toWireLinkTask(row, base), share_text: shareText(req.user, row, base) } satisfies LinkTaskResponse;
  });

  /** The creator takes it back; the page then says the link no longer works. */
  app.post("/link-tasks/:id/cancel", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    const row = p.success ? await prisma.linkTask.findFirst({ where: { id: p.data.id, creatorId: req.user.id } }) : null;
    if (!row || row.status === "cancelled") return reply.code(404).send({ error: "not_found" });
    if (!linkTaskCancellable(row.status as LinkTaskStatus)) return reply.code(422).send({ error: "not_allowed" });
    await prisma.linkTask.updateMany({ where: { id: row.id, status: row.status }, data: { status: "cancelled", updatedAt: now() } });
    return reply.code(204).send();
  });
};
