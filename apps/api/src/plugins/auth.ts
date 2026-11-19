import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { INSTALL_ID_HEADER } from "@fakkarni/shared";
import type { PrismaClient, User } from "../generated/prisma/client";

declare module "fastify" {
  interface FastifyRequest {
    user: User;
  }
}

const InstallId = z.uuid();

/**
 * Resolve the calling user. Until M5 (Supabase Auth) the phone sends a random install ID;
 * the user row is created on first contact. authId is namespaced so Supabase IDs can't collide.
 */
export function requireUser(prisma: PrismaClient) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = InstallId.safeParse(req.headers[INSTALL_ID_HEADER]);
    if (!parsed.success) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const authId = `install:${parsed.data}`;
    req.user = await prisma.user.upsert({
      where: { authId },
      create: { authId },
      update: { lastActiveAt: new Date() },
    });
  };
}
