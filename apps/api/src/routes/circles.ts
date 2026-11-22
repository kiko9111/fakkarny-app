import type { FastifyPluginAsync, FastifyRequest, preHandlerAsyncHookHandler } from "fastify";
import { z } from "zod";
import {
  CreateCircleRequest,
  normalizeInviteCode,
  PatchCircleRequest,
  type AcceptInviteResponse,
  type Circle as WireCircle,
  type CircleDetail,
  type CircleInvite,
  type CircleResponse,
  type CreateInviteResponse,
  type InvitePreview,
  type ListCirclesResponse,
} from "@fakkarni/shared";
import { Prisma, type Invite, type PrismaClient, type User } from "../generated/prisma/client";
import { canClaim } from "../billing/referral";
import { rewardInviter } from "../billing/referral-store";
import { INVITE_VALID_DAYS, inviteShareText, inviteState, MAX_CIRCLE_MEMBERS, MAX_CIRCLES_PER_USER, newInviteCode } from "../circles/rules";

export interface CircleRoutesOptions {
  prisma: PrismaClient;
  authenticate: preHandlerAsyncHookHandler;
  now?: () => Date;
  /** Where invite links point (PUBLIC_URL). Defaults to the host the request came in on. */
  publicUrl?: string;
}

const IdParam = z.object({ id: z.uuid() });
const MemberParam = z.object({ id: z.uuid(), userId: z.uuid() });
const CodeParam = z.object({ code: z.string().min(4).max(20) });

/** Base URL for links we hand out: the configured public URL, or the request's own host. */
export function baseUrl(req: FastifyRequest, publicUrl?: string): string {
  if (publicUrl) return publicUrl.replace(/\/+$/, "");
  const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim() || req.protocol;
  return `${proto}://${req.host}`;
}

export const inviteUrl = (base: string, code: string) => `${base}/i/${code}`;

export const circleRoutes: FastifyPluginAsync<CircleRoutesOptions> = async (app, opts) => {
  const { prisma } = opts;
  const now = opts.now ?? (() => new Date());
  app.addHook("preHandler", opts.authenticate);

  const wireInvite = (req: FastifyRequest, i: Invite): CircleInvite => ({
    code: i.code,
    url: inviteUrl(baseUrl(req, opts.publicUrl), i.code),
    joins: i.joins,
    created_at: i.createdAt.toISOString(),
    expires_at: i.expiresAt.toISOString(),
  });

  /** The circle as this member sees it, or null when they are not in it. */
  async function detail(req: FastifyRequest, circleId: string, user: User): Promise<CircleDetail | null> {
    const circle = await prisma.circle.findUnique({
      where: { id: circleId },
      include: { members: { include: { user: { select: { name: true } } }, orderBy: { joinedAt: "asc" } } },
    });
    const me = circle?.members.find((m) => m.userId === user.id);
    if (!circle || !me) return null;
    const invites = await prisma.invite.findMany({
      where: { circleId, inviterId: user.id, revokedAt: null, expiresAt: { gt: now() } },
      orderBy: { createdAt: "desc" },
    });
    return {
      id: circle.id,
      kind: circle.kind,
      name: circle.name,
      role: me.role,
      member_count: circle.members.length,
      created_at: circle.createdAt.toISOString(),
      members: circle.members.map((m) => ({ user_id: m.userId, name: m.user.name, role: m.role, joined_at: m.joinedAt.toISOString(), is_me: m.userId === user.id })),
      open_invites: invites.map((i) => wireInvite(req, i)),
    };
  }

  app.get("/circles", async (req) => {
    const rows = await prisma.circleMember.findMany({
      where: { userId: req.user.id },
      include: { circle: { include: { _count: { select: { members: true } } } } },
      orderBy: { joinedAt: "asc" },
    });
    const circles: WireCircle[] = rows.map((m) => ({
      id: m.circle.id,
      kind: m.circle.kind,
      name: m.circle.name,
      role: m.role,
      member_count: m.circle._count.members,
      created_at: m.circle.createdAt.toISOString(),
    }));
    return { circles } satisfies ListCirclesResponse;
  });

  app.post("/circles", async (req, reply) => {
    const body = CreateCircleRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    if ((await prisma.circleMember.count({ where: { userId: req.user.id } })) >= MAX_CIRCLES_PER_USER) return reply.code(409).send({ error: "too_many_circles" });
    const circle = await prisma.circle.create({
      data: { kind: body.data.kind, name: body.data.name, createdById: req.user.id, createdAt: now(), members: { create: { userId: req.user.id, role: "owner", joinedAt: now() } } },
    });
    await prisma.event.create({ data: { userId: req.user.id, name: "circle_created", propsJson: { kind: circle.kind } } });
    return reply.code(201).send({ circle: (await detail(req, circle.id, req.user))! } satisfies CircleResponse);
  });

  app.get("/circles/:id", async (req, reply) => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: "invalid_request" });
    const circle = await detail(req, params.data.id, req.user);
    if (!circle) return reply.code(404).send({ error: "not_found" });
    return { circle } satisfies CircleResponse;
  });

  /** Rename (owner only). */
  app.patch("/circles/:id", async (req, reply) => {
    const params = IdParam.safeParse(req.params);
    const body = PatchCircleRequest.safeParse(req.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "invalid_request" });
    const me = await prisma.circleMember.findUnique({ where: { circleId_userId: { circleId: params.data.id, userId: req.user.id } } });
    if (!me) return reply.code(404).send({ error: "not_found" });
    if (me.role !== "owner") return reply.code(403).send({ error: "owner_only" });
    await prisma.circle.update({ where: { id: params.data.id }, data: { name: body.data.name } });
    return { circle: (await detail(req, params.data.id, req.user))! } satisfies CircleResponse;
  });

  /** Delete the whole circle (owner only). */
  app.delete("/circles/:id", async (req, reply) => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: "invalid_request" });
    const me = await prisma.circleMember.findUnique({ where: { circleId_userId: { circleId: params.data.id, userId: req.user.id } } });
    if (!me) return reply.code(404).send({ error: "not_found" });
    if (me.role !== "owner") return reply.code(403).send({ error: "owner_only" });
    await prisma.circle.delete({ where: { id: params.data.id } });
    return reply.code(204).send();
  });

  /** Remove a member (owner), or leave (yourself). When the owner leaves, the longest-standing member takes over. */
  app.delete("/circles/:id/members/:userId", async (req, reply) => {
    const params = MemberParam.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: "invalid_request" });
    const { id: circleId, userId } = params.data;
    const me = await prisma.circleMember.findUnique({ where: { circleId_userId: { circleId, userId: req.user.id } } });
    if (!me) return reply.code(404).send({ error: "not_found" });
    if (userId !== req.user.id && me.role !== "owner") return reply.code(403).send({ error: "owner_only" });
    await prisma.$transaction(async (tx) => {
      const target = await tx.circleMember.findUnique({ where: { circleId_userId: { circleId, userId } } });
      if (!target) return;
      await tx.circleMember.delete({ where: { circleId_userId: { circleId, userId } } });
      await tx.invite.updateMany({ where: { circleId, inviterId: userId, revokedAt: null }, data: { revokedAt: now() } });
      const next = await tx.circleMember.findFirst({ where: { circleId }, orderBy: { joinedAt: "asc" } });
      if (!next) await tx.circle.delete({ where: { id: circleId } });
      else if (target.role === "owner") await tx.circleMember.update({ where: { circleId_userId: { circleId, userId: next.userId } }, data: { role: "owner" } });
    });
    return reply.code(204).send();
  });

  /** A link for WhatsApp. Any member can invite; asking again returns the same live link. */
  app.post("/circles/:id/invites", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: "invalid_request" });
    const circle = await prisma.circle.findFirst({ where: { id: params.data.id, members: { some: { userId: req.user.id } } } });
    if (!circle) return reply.code(404).send({ error: "not_found" });
    const at = now();
    let invite = await prisma.invite.findFirst({
      // Reuse a link with at least a week left, so a re-share doesn't hand out one about to die.
      where: { circleId: circle.id, inviterId: req.user.id, revokedAt: null, expiresAt: { gt: new Date(at.getTime() + 7 * 86_400_000) } },
      orderBy: { createdAt: "desc" },
    });
    for (let attempt = 0; !invite; attempt++) {
      try {
        invite = await prisma.invite.create({
          data: { code: newInviteCode(), circleId: circle.id, inviterId: req.user.id, createdAt: at, expiresAt: new Date(at.getTime() + INVITE_VALID_DAYS * 86_400_000) },
        });
        await prisma.event.create({ data: { userId: req.user.id, name: "invite_created", propsJson: { kind: circle.kind } } });
      } catch (err) {
        if (attempt < 4 && err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
        throw err;
      }
    }
    const wire = wireInvite(req, invite);
    const res: CreateInviteResponse = {
      invite: wire,
      share_text: inviteShareText({ lang: req.user.language === "en" ? "en" : "ar", circleName: circle.name, kind: circle.kind, url: wire.url }),
    };
    return reply.code(201).send(res);
  });

  async function loadInvite(code: string, userId: string) {
    const invite = await prisma.invite.findUnique({
      where: { code: normalizeInviteCode(code) },
      include: { circle: { include: { _count: { select: { members: true } } } }, inviter: { select: { id: true, name: true } } },
    });
    if (!invite) return null;
    const isMember = Boolean(await prisma.circleMember.findUnique({ where: { circleId_userId: { circleId: invite.circleId, userId } } }));
    return { invite, state: inviteState(invite, { memberCount: invite.circle._count.members, isMember }, now()) };
  }

  /** What the app shows before joining (from the link, or a typed code). */
  app.get("/invites/:code", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const params = CodeParam.safeParse(req.params);
    const found = params.success ? await loadInvite(params.data.code, req.user.id) : null;
    if (!found) return reply.code(404).send({ error: "not_found" });
    const { invite, state } = found;
    const res: InvitePreview = {
      code: invite.code,
      circle_name: invite.circle.name,
      circle_kind: invite.circle.kind,
      inviter_name: invite.inviter.name,
      member_count: invite.circle._count.members,
      state,
    };
    return res;
  });

  /** Join the circle. A new, signed-in user also earns their inviter Pro days (once). */
  app.post("/invites/:code/accept", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const params = CodeParam.safeParse(req.params);
    const found = params.success ? await loadInvite(params.data.code, req.user.id) : null;
    if (!found) return reply.code(404).send({ error: "not_found" });
    const { invite, state } = found;
    if (state === "expired" || state === "full") return reply.code(409).send({ error: state });
    if (state === "open") {
      const at = now();
      await prisma.$transaction(async (tx) => {
        // Re-check the size inside the transaction; a duplicate join is a no-op.
        if ((await tx.circleMember.count({ where: { circleId: invite.circleId } })) >= MAX_CIRCLE_MEMBERS) return;
        const added = await tx.circleMember.createMany({ data: [{ circleId: invite.circleId, userId: req.user.id, joinedAt: at }], skipDuplicates: true });
        if (added.count === 0) return;
        await tx.invite.update({ where: { id: invite.id }, data: { joins: { increment: 1 } } });
        await tx.event.create({ data: { userId: req.user.id, name: "invite_accepted", propsJson: { kind: invite.circle.kind } } });
        if (canClaim(req.user, invite.inviter, at).ok) await rewardInviter(tx, req.user.id, invite.inviter.id, at);
      });
    }
    const circle = await detail(req, invite.circleId, req.user);
    if (!circle) return reply.code(409).send({ error: "full" });
    return { circle } satisfies AcceptInviteResponse;
  });
};
