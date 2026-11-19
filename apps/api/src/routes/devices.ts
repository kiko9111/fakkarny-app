import type { FastifyPluginAsync } from "fastify";
import { RegisterDeviceRequest } from "@fakkarni/shared";
import type { PrismaClient } from "../generated/prisma/client";
import type { preHandlerAsyncHookHandler } from "fastify";

export const deviceRoutes: FastifyPluginAsync<{ prisma: PrismaClient; authenticate: preHandlerAsyncHookHandler }> = async (app, { prisma, authenticate }) => {
  app.addHook("preHandler", authenticate);

  /** Register (or move) a push token to this user. A token belongs to one device/user at a time. */
  app.post("/devices", async (req, reply) => {
    const body = RegisterDeviceRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    const { platform, push_token } = body.data;
    const now = new Date();
    if (push_token) {
      await prisma.device.upsert({
        where: { pushToken: push_token },
        create: { userId: req.user.id, platform, pushToken: push_token, lastSeenAt: now },
        update: { userId: req.user.id, platform, lastSeenAt: now },
      });
    } else {
      await prisma.device.create({ data: { userId: req.user.id, platform, lastSeenAt: now } });
    }
    return reply.code(204).send();
  });
};
