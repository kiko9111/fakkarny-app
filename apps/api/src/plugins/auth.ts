import type { FastifyReply, FastifyRequest } from "fastify";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { z } from "zod";
import { INSTALL_ID_HEADER } from "@fakkarni/shared";
import type { PrismaClient, User } from "../generated/prisma/client";

declare module "fastify" {
  interface FastifyRequest {
    user: User;
  }
}

/**
 * Identity (FR-10). Supabase Auth (phone OTP, Apple, Google) issues a JWT the phone sends as
 * `Authorization: Bearer`. Before sign-in — and in development — the phone's random install ID
 * works too, unless ALLOW_INSTALL_ID is off.
 */
export interface AuthConfig {
  /** e.g. https://abcd.supabase.co — verifies tokens with the project's JWKS (asymmetric keys). */
  supabaseUrl?: string;
  /** Legacy HS256 projects: the JWT secret. */
  supabaseJwtSecret?: string;
  allowInstallId: boolean;
}

export const supabaseAuthId = (sub: string) => `supabase:${sub}`;
/** last_active_at only needs minute-level freshness (the tick looks at people active in the last days). */
const ACTIVE_WRITE_MS = 5 * 60_000;

export const installAuthId = (id: string) => `install:${id}`;

const InstallId = z.uuid();

export interface Verifier {
  /** Supabase user id (`sub`) for a valid token, else null. */
  verify(token: string): Promise<string | null>;
}

export function createVerifier(cfg: AuthConfig): Verifier | null {
  let key: Uint8Array | JWTVerifyGetKey | null = null;
  if (cfg.supabaseJwtSecret) key = new TextEncoder().encode(cfg.supabaseJwtSecret);
  else if (cfg.supabaseUrl) key = createRemoteJWKSet(new URL("/auth/v1/.well-known/jwks.json", cfg.supabaseUrl));
  if (!key) return null;
  const issuer = cfg.supabaseUrl ? new URL("/auth/v1", cfg.supabaseUrl).toString() : undefined;
  return {
    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, key as Uint8Array, { audience: "authenticated", ...(issuer ? { issuer } : {}) });
        return typeof payload.sub === "string" && payload.sub ? payload.sub : null;
      } catch {
        return null;
      }
    },
  };
}

function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  return h?.startsWith("Bearer ") ? h.slice(7) : null;
}

/** Resolve the calling user, creating the row on first contact. */
export function requireUser(prisma: PrismaClient, cfg: AuthConfig = { allowInstallId: true }, verifier = createVerifier(cfg)) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    let authId: string | null = null;
    const token = bearer(req);
    if (token) {
      const sub = verifier ? await verifier.verify(token) : null;
      if (!sub) return reply.code(401).send({ error: "invalid_token" });
      authId = supabaseAuthId(sub);
    } else if (cfg.allowInstallId) {
      const parsed = InstallId.safeParse(req.headers[INSTALL_ID_HEADER]);
      if (parsed.success) authId = installAuthId(parsed.data);
    }
    if (!authId) return reply.code(401).send({ error: "unauthorized" });
    // One read per request; the write happens only for a new user or when last_active_at is
    // more than ACTIVE_WRITE_MS old (it was an upsert, i.e. a row write, on every request, and
    // a screen fires several requests at once at the same row).
    const found = await prisma.user.findUnique({ where: { authId } });
    if (!found) req.user = await prisma.user.upsert({ where: { authId }, create: { authId }, update: { lastActiveAt: new Date() } });
    else if (!found.lastActiveAt || Date.now() - found.lastActiveAt.getTime() > ACTIVE_WRITE_MS) req.user = await prisma.user.update({ where: { id: found.id }, data: { lastActiveAt: new Date() } });
    else req.user = found;
  };
}

/**
 * After sign-in, attach what this phone captured before sign-in to the account (POST /auth/link).
 * If the account is new, the install user simply becomes it; otherwise the install user's data
 * moves over and the install user is removed.
 */
export async function linkInstallToAccount(prisma: PrismaClient, installId: string, accountAuthId: string): Promise<User> {
  return prisma.$transaction(async (tx) => {
    const install = await tx.user.findUnique({ where: { authId: installAuthId(installId) } });
    const account = await tx.user.findUnique({ where: { authId: accountAuthId } });
    if (!install) return account ?? tx.user.create({ data: { authId: accountAuthId } });
    if (!account) return tx.user.update({ where: { id: install.id }, data: { authId: accountAuthId } });
    if (install.id === account.id) return account;
    const move = { where: { userId: install.id }, data: { userId: account.id } };
    await tx.message.updateMany(move);
    await tx.item.updateMany(move);
    await tx.memory.updateMany(move);
    await tx.summary.updateMany(move);
    await tx.device.updateMany(move);
    await tx.event.updateMany(move);
    await tx.tracker.updateMany(move);
    await tx.reflectSession.updateMany(move);
    // Session consent is personal: keep the account's own, else carry the install's over.
    if (!(await tx.sessionConsent.findUnique({ where: { userId: account.id } }))) await tx.sessionConsent.updateMany(move);
    // Circles: keep memberships the account doesn't already have (the rest go with the install user).
    const mine = new Set((await tx.circleMember.findMany({ where: { userId: account.id }, select: { circleId: true } })).map((m) => m.circleId));
    await tx.circleMember.updateMany({ where: { userId: install.id, circleId: { notIn: [...mine] } }, data: { userId: account.id } });
    await tx.circleMember.updateMany({ where: { userId: account.id, role: "member", circle: { members: { some: { userId: install.id, role: "owner" } } } }, data: { role: "owner" } });
    await tx.invite.updateMany({ where: { inviterId: install.id }, data: { inviterId: account.id } });
    await tx.circle.updateMany({ where: { createdById: install.id }, data: { createdById: account.id } });
    await tx.user.updateMany({ where: { referredById: install.id }, data: { referredById: account.id } });
    await tx.daftarEntry.updateMany({ where: { creatorId: install.id }, data: { creatorId: account.id } });
    await tx.daftarEntry.updateMany({ where: { otherUserId: install.id }, data: { otherUserId: account.id } });
    await tx.circleTask.updateMany({ where: { assignerId: install.id }, data: { assignerId: account.id } });
    await tx.circleTask.updateMany({ where: { assigneeId: install.id }, data: { assigneeId: account.id } });
    await tx.circlePost.updateMany({ where: { actorId: install.id }, data: { actorId: account.id } });
    await tx.circlePost.updateMany({ where: { targetId: install.id }, data: { targetId: account.id } });
    await tx.user.delete({ where: { id: install.id } });
    const notSelf = (id: string | null) => (id === install.id || id === account.id ? null : id);
    const bonus = [account.bonusProUntil, install.bonusProUntil].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    return tx.user.update({
      where: { id: account.id },
      data: {
        name: account.name ?? install.name,
        lastActiveAt: new Date(),
        bonusProUntil: bonus,
        referralCode: account.referralCode ?? install.referralCode,
        instapayLink: account.instapayLink ?? install.instapayLink,
        // The moves above may have pointed the account at itself (it was referred by this install).
        referredById: notSelf(account.referredById) ?? notSelf(install.referredById),
      },
    });
  });
}
