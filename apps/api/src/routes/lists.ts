import type { FastifyPluginAsync, preHandlerAsyncHookHandler } from "fastify";
import { z } from "zod";
import {
  AddListItemsRequest,
  CreateListRequest,
  ListTripRequest,
  MAX_LISTS_PER_OWNER,
  UpdateListItemRequest,
  UpdateListRequest,
  type HouseListResponse,
} from "@fakkarni/shared";
import type { PrismaClient } from "../generated/prisma/client";
import { inBackground } from "../lib/background";
import { listShareText } from "../links/rules";
import { listLinkUrl } from "../links/store";
import { withFreshCode } from "../web/link-page";
import { baseUrl } from "./circles";
import { pushNotices } from "../proactive/notify";
import type { PushSender } from "../proactive/push";
import {
  addItems,
  findList,
  readList,
  setDone,
  setTrip,
  toWireList,
  visibleLists,
  withItems,
} from "../lists/store";

export interface ListRoutesOptions {
  prisma: PrismaClient;
  authenticate: preHandlerAsyncHookHandler;
  now?: () => Date;
  push?: PushSender;
  publicUrl?: string;
}

const IdParam = z.object({ id: z.uuid() });
const ItemParam = z.object({ id: z.uuid(), itemId: z.uuid() });

/**
 * Shared household lists: GET /lists (every list the caller sees, with its items), make, rename,
 * delete, add items, tick off, and "I'm going shopping". Free for everyone; no AI call.
 */
export const listRoutes: FastifyPluginAsync<ListRoutesOptions> = async (
  app,
  opts,
) => {
  const { prisma } = opts;
  const now = opts.now ?? (() => new Date());
  app.addHook("preHandler", opts.authenticate);

  const answer = async (userId: string, id: string, at: Date) => {
    const list = await readList(prisma, userId, id, at);
    return list ? ({ list } satisfies HouseListResponse) : null;
  };

  app.get("/lists", async (req) => {
    const at = now();
    const rows = await prisma.houseList.findMany({
      where: visibleLists(req.user.id),
      include: withItems(at),
      orderBy: [{ updatedAt: "desc" }],
      take: 60,
    });
    return { lists: rows.map((l) => toWireList(l, req.user.id, at)) };
  });

  app.get("/lists/:id", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    const out = p.success ? await answer(req.user.id, p.data.id, now()) : null;
    return out ?? reply.code(404).send({ error: "not_found" });
  });

  app.post("/lists", async (req, reply) => {
    const body = CreateListRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    const at = now();
    const { id, name, place, circle_id } = body.data;
    if (id) {
      const known = await prisma.houseList.findUnique({
        where: { id },
        select: { id: true },
      });
      if (known) {
        const out = await answer(req.user.id, id, at);
        return out
          ? reply.code(200).send(out)
          : reply.code(422).send({ error: "taken" });
      }
    }
    if (
      circle_id &&
      !(await prisma.circleMember.count({
        where: { circleId: circle_id, userId: req.user.id },
      }))
    )
      return reply.code(422).send({ error: "invalid_circle" });
    const count = await prisma.houseList.count({
      where: circle_id
        ? { circleId: circle_id }
        : { circleId: null, ownerId: req.user.id },
    });
    if (count >= MAX_LISTS_PER_OWNER)
      return reply.code(422).send({ error: "too_many_lists" });
    const made = await prisma.houseList.create({
      data: {
        ...(id ? { id } : {}),
        ownerId: req.user.id,
        circleId: circle_id,
        name,
        place,
        createdAt: at,
        updatedAt: at,
      },
    });
    inBackground(
      prisma.event.create({
        data: {
          userId: req.user.id,
          name: "list_created",
          propsJson: { place, shared: Boolean(circle_id), via: "app" },
        },
      }),
    );
    return reply.code(201).send(await answer(req.user.id, made.id, at));
  });

  app.patch("/lists/:id", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    const body = UpdateListRequest.safeParse(req.body);
    if (!p.success) return reply.code(404).send({ error: "not_found" });
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    const at = now();
    const n = await prisma.houseList.updateMany({
      where: { id: p.data.id, ...visibleLists(req.user.id) },
      data: { ...body.data, updatedAt: at },
    });
    if (!n.count) return reply.code(404).send({ error: "not_found" });
    return answer(req.user.id, p.data.id, at);
  });

  /** The creator, or the circle's owner, deletes a list. */
  app.delete("/lists/:id", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    const list = p.success
      ? await prisma.houseList.findFirst({
          where: { id: p.data.id, ...visibleLists(req.user.id) },
          include: {
            circle: {
              select: {
                members: {
                  where: { userId: req.user.id },
                  select: { role: true },
                },
              },
            },
          },
        })
      : null;
    if (!list) return reply.code(404).send({ error: "not_found" });
    const owner =
      list.ownerId === req.user.id ||
      list.circle?.members[0]?.role === "owner" ||
      (list.circleId !== null && list.ownerId === null);
    if (!owner) return reply.code(403).send({ error: "not_owner" });
    await prisma.houseList.delete({ where: { id: list.id } });
    return reply.code(204).send();
  });

  app.post(
    "/lists/:id/items",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const p = IdParam.safeParse(req.params);
      const body = AddListItemsRequest.safeParse(req.body);
      if (!p.success) return reply.code(404).send({ error: "not_found" });
      if (!body.success) return reply.code(400).send({ error: "invalid_body" });
      const at = now();
      const out = await addItems(
        prisma,
        req.user,
        p.data.id,
        body.data.items,
        at,
      );
      if (!out) return reply.code(404).send({ error: "not_found" });
      void pushNotices(prisma, opts.push, out.notices, app.log);
      if (out.added.length)
        inBackground(
          prisma.event.create({
            data: {
              userId: req.user.id,
              name: "list_items_added",
              propsJson: {
                count: out.added.length,
                via: "app",
                shared: Boolean(out.list.circleId),
              },
            },
          }),
        );
      return {
        list: toWireList(out.list, req.user.id, at),
      } satisfies HouseListResponse;
    },
  );

  app.patch("/lists/:id/items/:itemId", async (req, reply) => {
    const p = ItemParam.safeParse(req.params);
    const body = UpdateListItemRequest.safeParse(req.body ?? {});
    if (!p.success) return reply.code(404).send({ error: "not_found" });
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    const at = now();
    const { done, title, qty } = body.data;
    if (
      done !== undefined &&
      !(await setDone(prisma, req.user.id, p.data.id, p.data.itemId, done, at))
    )
      return reply.code(404).send({ error: "not_found" });
    if (title !== undefined || qty !== undefined) {
      const n = await prisma.houseListItem.updateMany({
        where: {
          id: p.data.itemId,
          listId: p.data.id,
          list: visibleLists(req.user.id),
        },
        data: {
          ...(title !== undefined ? { title } : {}),
          ...(qty !== undefined ? { qty } : {}),
        },
      });
      if (!n.count) return reply.code(404).send({ error: "not_found" });
    }
    const out = await answer(req.user.id, p.data.id, at);
    return out ?? reply.code(404).send({ error: "not_found" });
  });

  app.delete("/lists/:id/items/:itemId", async (req, reply) => {
    const p = ItemParam.safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: "not_found" });
    const at = now();
    await prisma.houseListItem.deleteMany({
      where: {
        id: p.data.itemId,
        listId: p.data.id,
        list: visibleLists(req.user.id),
      },
    });
    const out = await answer(req.user.id, p.data.id, at);
    return out ?? reply.code(404).send({ error: "not_found" });
  });

  /** Remove every ticked item. */
  app.post("/lists/:id/clear", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: "not_found" });
    const at = now();
    const list = await findList(prisma, req.user.id, p.data.id, at);
    if (!list) return reply.code(404).send({ error: "not_found" });
    await prisma.houseListItem.deleteMany({
      where: { listId: list.id, doneAt: { not: null } },
    });
    return answer(req.user.id, list.id, at);
  });

  /** "I'm going shopping" / "I'm back". Going tells the circle (chat line + push). */
  app.post("/lists/:id/trip", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    const body = ListTripRequest.safeParse(req.body);
    if (!p.success) return reply.code(404).send({ error: "not_found" });
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    const at = now();
    const out = await setTrip(prisma, req.user, p.data.id, body.data.going, at);
    if (!out) return reply.code(404).send({ error: "not_found" });
    void pushNotices(prisma, opts.push, out.notices, app.log);
    if (body.data.going)
      inBackground(
        prisma.event.create({
          data: {
            userId: req.user.id,
            name: "list_trip",
            propsJson: { via: "app", told: out.notices.length },
          },
        }),
      );
    return {
      list: toWireList(out.list, req.user.id, at),
    } satisfies HouseListResponse;
  });

  /**
   * The list's no-app link: anyone holding it sees, ticks and adds in a browser (GET /l/:code).
   * Asking again gives the same link; DELETE stops it (a new one is a new code).
   */
  app.post("/lists/:id/link", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    const list = p.success ? await findList(prisma, req.user.id, p.data.id, now()) : null;
    if (!list) return reply.code(404).send({ error: "not_found" });
    const code =
      list.shareCode ??
      (await withFreshCode(async (c) => {
        const n = await prisma.houseList.updateMany({ where: { id: list.id, shareCode: null }, data: { shareCode: c } });
        if (n.count) return c;
        // Someone else made it a moment ago: use theirs.
        return (await prisma.houseList.findUniqueOrThrow({ where: { id: list.id }, select: { shareCode: true } })).shareCode!;
      }));
    if (!list.shareCode) inBackground(prisma.event.create({ data: { userId: req.user.id, name: "list_link_made", propsJson: { shared: Boolean(list.circleId) } } }));
    const url = listLinkUrl(baseUrl(req, opts.publicUrl), code);
    const lang = req.user.language === "en" ? "en" : "ar";
    return { url, share_text: listShareText({ lang, from: req.user.name, list: list.name, open: list.items.filter((i) => !i.doneAt).length, url }) };
  });

  app.delete("/lists/:id/link", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: "not_found" });
    const n = await prisma.houseList.updateMany({ where: { id: p.data.id, ...visibleLists(req.user.id) }, data: { shareCode: null, updatedAt: now() } });
    if (!n.count) return reply.code(404).send({ error: "not_found" });
    return answer(req.user.id, p.data.id, now());
  });
};
