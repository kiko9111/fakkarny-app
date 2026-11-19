import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { PatchItemRequest, type ItemResponse, type ListItemsResponse, type ListMemoriesResponse } from "@fakkarni/shared";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import type { preHandlerAsyncHookHandler } from "fastify";
import { toWireItem, toWireMemory } from "../serialize";

const IdParam = z.object({ id: z.uuid() });
const ListQuery = z.object({ status: z.enum(["open", "done", "cancelled"]).optional() });

export const itemRoutes: FastifyPluginAsync<{ prisma: PrismaClient; authenticate: preHandlerAsyncHookHandler }> = async (app, { prisma, authenticate }) => {
  app.addHook("preHandler", authenticate);

  app.get("/items", async (req, reply) => {
    const q = ListQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "invalid_query" });
    const items = await prisma.item.findMany({
      where: { userId: req.user.id, ...(q.data.status ? { status: q.data.status } : {}) },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: 500,
    });
    const res: ListItemsResponse = { items: items.map(toWireItem) };
    return res;
  });

  app.patch("/items/:id", async (req, reply) => {
    const params = IdParam.safeParse(req.params);
    const body = PatchItemRequest.safeParse(req.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "invalid_request" });
    const existing = await prisma.item.findFirst({ where: { id: params.data.id, userId: req.user.id } });
    if (!existing) return reply.code(404).send({ error: "not_found" });
    const data: Prisma.ItemUpdateInput = {};
    if (body.data.title) data.title = body.data.title;
    if (body.data.status) {
      data.status = body.data.status;
      data.doneAt = body.data.status === "done" ? new Date() : null;
    }
    if (body.data.due_at !== undefined) data.dueAt = body.data.due_at ? new Date(body.data.due_at) : null;
    if (body.data.remind_at !== undefined) data.remindAt = body.data.remind_at ? new Date(body.data.remind_at) : null;
    const item = await prisma.item.update({ where: { id: existing.id }, data });
    await prisma.event.create({ data: { userId: req.user.id, name: "item_edited_by_user", propsJson: { fields: Object.keys(body.data) } } });
    const res: ItemResponse = { item: toWireItem(item) };
    return res;
  });

  app.get("/memories", async (req) => {
    const memories = await prisma.memory.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: "desc" } });
    const res: ListMemoriesResponse = { memories: memories.map(toWireMemory) };
    return res;
  });

  app.delete("/memories/:id", async (req, reply) => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: "invalid_request" });
    const { count } = await prisma.memory.deleteMany({ where: { id: params.data.id, userId: req.user.id } });
    if (!count) return reply.code(404).send({ error: "not_found" });
    return reply.code(204).send();
  });
};
