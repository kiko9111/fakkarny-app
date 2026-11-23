import type { FastifyPluginAsync, preHandlerAsyncHookHandler } from "fastify";
import { z } from "zod";
import { CommentRequest, ReactRequest, type PostResponse } from "@fakkarni/shared";
import type { CirclePost, PrismaClient, User } from "../generated/prisma/client";
import { askZaki, zakiAnswer } from "../circles/ask";
import { addressesZaki } from "../circles/zaki";
import { pushNotices, type Notice } from "../proactive/notify";
import type { PushSender } from "../proactive/push";
import { langOf, wirePosts } from "../tasks/store";

export interface FeedRoutesOptions {
  prisma: PrismaClient;
  authenticate: preHandlerAsyncHookHandler;
  now?: () => Date;
  push?: PushSender;
  /** Off (stores not set up yet): every circle keeps its extras. */
  requireSubscription?: boolean;
}

const IdParam = z.object({ id: z.uuid() });
const PostParam = z.object({ id: z.uuid(), postId: z.uuid() });
const CommentParam = z.object({ id: z.uuid(), commentId: z.uuid() });

/**
 * The circle activity feed: members react and leave short comments on what happened, and can
 * ask Zaki for something there (@Zaki). Light on purpose: not a group chat, so it never tries to
 * replace WhatsApp. Free; Zaki's answers are rules and templates (no AI call).
 */
export const feedRoutes: FastifyPluginAsync<FeedRoutesOptions> = async (app, opts) => {
  const { prisma } = opts;
  const now = opts.now ?? (() => new Date());
  app.addHook("preHandler", opts.authenticate);

  const circleFor = (circleId: string, userId: string) => prisma.circle.findFirst({ where: { id: circleId, members: { some: { userId } } }, include: { members: { select: { userId: true } } } });
  const one = async (post: CirclePost, user: User): Promise<PostResponse> => ({ post: (await wirePosts(prisma, [post], langOf(user), user.id))[0]! });
  const findPost = async (params: unknown, user: User) => {
    const p = PostParam.safeParse(params);
    if (!p.success) return null;
    const circle = await circleFor(p.data.id, user.id);
    const post = circle ? await prisma.circlePost.findFirst({ where: { id: p.data.postId, circleId: circle.id } }) : null;
    return circle && post ? { circle, post } : null;
  };

  app.post("/circles/:id/posts/:postId/react", async (req, reply) => {
    const found = await findPost(req.params, req.user);
    const body = ReactRequest.safeParse(req.body);
    if (!found) return reply.code(404).send({ error: "not_found" });
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    const where = { postId_userId: { postId: found.post.id, userId: req.user.id } };
    if (body.data.key === null) await prisma.postReaction.deleteMany({ where: { postId: found.post.id, userId: req.user.id } });
    else await prisma.postReaction.upsert({ where, create: { postId: found.post.id, userId: req.user.id, key: body.data.key, createdAt: now() }, update: { key: body.data.key } });
    return one(found.post, req.user);
  });

  app.post("/circles/:id/posts/:postId/comments", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const found = await findPost(req.params, req.user);
    const body = CommentRequest.safeParse(req.body);
    if (!found) return reply.code(404).send({ error: "not_found" });
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    const at = now();
    await prisma.postComment.create({ data: { postId: found.post.id, userId: req.user.id, text: body.data.text, createdAt: at } });
    const notices: Notice[] = [];
    if (addressesZaki(body.data.text)) {
      const answer = await zakiAnswer(prisma, found.circle, req.user, body.data.text, at, opts.requireSubscription ?? false);
      await prisma.postComment.create({ data: { postId: found.post.id, zakiEvent: answer.event, createdAt: new Date(at.getTime() + 1) } });
      notices.push(...answer.notices);
    } else if (found.post.actorId && found.post.actorId !== req.user.id && found.circle.members.some((m) => m.userId === found.post.actorId)) {
      // The person the item is about hears about a comment on it (push only, nothing in chat).
      const actor = await prisma.user.findUnique({ where: { id: found.post.actorId }, select: { id: true, language: true } });
      if (actor) notices.push({ userId: actor.id, text: `${req.user.name ?? (langOf(actor) === "ar" ? "حد" : "Someone")}: ${body.data.text}` });
    }
    await prisma.event.create({ data: { userId: req.user.id, name: "feed_comment", propsJson: { zaki: addressesZaki(body.data.text) } } });
    void pushNotices(prisma, opts.push, notices, app.log);
    return reply.code(201).send(await one(found.post, req.user));
  });

  app.delete("/circles/:id/comments/:commentId", async (req, reply) => {
    const p = CommentParam.safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: "not_found" });
    const deleted = await prisma.postComment.deleteMany({ where: { id: p.data.commentId, userId: req.user.id, post: { circleId: p.data.id } } });
    return deleted.count ? reply.code(204).send() : reply.code(404).send({ error: "not_found" });
  });

  /** Ask Zaki for something in front of the circle ("Zaki, remind everyone about Friday lunch"). */
  app.post("/circles/:id/zaki", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    const body = CommentRequest.safeParse(req.body);
    if (!p.success) return reply.code(404).send({ error: "not_found" });
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    const circle = await circleFor(p.data.id, req.user.id);
    if (!circle) return reply.code(404).send({ error: "not_found" });
    const { post, notices } = await askZaki(prisma, circle, req.user, body.data.text, now(), opts.requireSubscription ?? false);
    void pushNotices(prisma, opts.push, notices, app.log);
    return reply.code(201).send(await one(post, req.user));
  });
};
