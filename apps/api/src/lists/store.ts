import {
  DONE_VISIBLE_HOURS,
  defaultListName,
  foldThing,
  MAX_LIST_ITEMS,
  TRIP_HOURS,
  type HouseList as WireList,
  type ListPlace,
} from "@fakkarni/shared";
import type { Prisma, PrismaClient, User } from "../generated/prisma/client";
import { postUpdate } from "../daftar/store";
import type { Notice } from "../proactive/notify";
import { langOf } from "../tasks/store";
import { addedLine, tripEndLine, tripStartLine } from "./rules";

/**
 * Shared household lists: who may see a list, its wire shape, and the writes that the routes
 * and the chat share. Words come from templates (lists/rules.ts), never the model.
 */

type Db = PrismaClient | Prisma.TransactionClient;
type Actor = Pick<User, "id" | "name" | "language">;

/** Lists the user can see: their private ones and those of every circle they are in. */
export const visibleLists = (userId: string): Prisma.HouseListWhereInput => ({
  OR: [
    { circleId: null, ownerId: userId },
    { circle: { members: { some: { userId } } } },
  ],
});

export const withItems = (now: Date) =>
  ({
    circle: { select: { name: true } },
    tripUser: { select: { name: true } },
    items: {
      where: {
        OR: [
          { doneAt: null },
          {
            doneAt: {
              gte: new Date(now.getTime() - DONE_VISIBLE_HOURS * 3600_000),
            },
          },
        ],
      },
      include: {
        addedBy: { select: { name: true } },
        doneBy: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
      take: MAX_LIST_ITEMS,
    },
  }) satisfies Prisma.HouseListInclude;

export type ListWithItems = Prisma.HouseListGetPayload<{
  include: ReturnType<typeof withItems>;
}>;

/** A trip is shown while it is under TRIP_HOURS old. */
export const tripActive = (
  l: { tripUserId: string | null; tripAt: Date | null },
  now: Date,
) =>
  Boolean(
    l.tripUserId &&
    l.tripAt &&
    now.getTime() - l.tripAt.getTime() < TRIP_HOURS * 3600_000,
  );

export function toWireList(
  l: ListWithItems,
  userId: string,
  now: Date,
): WireList {
  const items = l.items.map((i) => ({
    id: i.id,
    title: i.title,
    qty: i.qty,
    added_by_name: i.addedBy?.name ?? null,
    is_mine: i.addedById === userId,
    done: i.doneAt !== null,
    done_by_name: i.doneBy?.name ?? null,
    done_at: i.doneAt?.toISOString() ?? null,
    created_at: i.createdAt.toISOString(),
  }));
  return {
    id: l.id,
    name: l.name,
    place: (l.place as ListPlace) ?? "other",
    circle_id: l.circleId,
    circle_name: l.circle?.name ?? null,
    is_owner: l.ownerId === userId,
    open_count: items.filter((i) => !i.done).length,
    trip: tripActive(l, now)
      ? {
          user_id: l.tripUserId!,
          name: l.tripUser?.name ?? null,
          is_me: l.tripUserId === userId,
          at: l.tripAt!.toISOString(),
        }
      : null,
    items,
    updated_at: l.updatedAt.toISOString(),
  };
}

export async function findList(
  db: Db,
  userId: string,
  id: string,
  now: Date,
): Promise<ListWithItems | null> {
  return db.houseList.findFirst({
    where: { id, ...visibleLists(userId) },
    include: withItems(now),
  });
}

export async function readList(
  db: Db,
  userId: string,
  id: string,
  now: Date,
): Promise<WireList | null> {
  const l = await findList(db, userId, id, now);
  return l ? toWireList(l, userId, now) : null;
}

/** The other members of the list's circle (none for a private list). */
async function othersOf(
  db: Db,
  list: { circleId: string | null },
  userId: string,
) {
  if (!list.circleId) return [];
  const members = await db.circleMember.findMany({
    where: { circleId: list.circleId, userId: { not: userId } },
    include: { user: { select: { id: true, language: true } } },
  });
  return members.map((m) => m.user);
}

export interface Added {
  list: ListWithItems;
  /** Titles that went in (already on the list = left out). */
  added: { id: string; title: string }[];
  /** Already open on the list. */
  already: string[];
  notices: Notice[];
}

/**
 * Add things to a list. Something already open on it (by folded name) is not added twice. When
 * someone else is out shopping for this list, they hear about it in their chat and by push.
 */
export async function addItems(
  db: Db,
  user: Actor,
  listId: string,
  things: {
    id?: string | undefined;
    title: string;
    qty?: string | null | undefined;
  }[],
  now: Date,
): Promise<Added | null> {
  const list = await db.houseList.findFirst({
    where: { id: listId, ...visibleLists(user.id) },
    include: {
      items: { where: { doneAt: null }, select: { id: true, title: true } },
    },
  });
  if (!list) return null;
  const open = new Map(list.items.map((i) => [foldThing(i.title), i.title]));
  const room = Math.max(0, MAX_LIST_ITEMS - list.items.length);
  const added: { id: string; title: string }[] = [];
  const already: string[] = [];
  for (const t of things) {
    const key = foldThing(t.title);
    if (!key) continue;
    if (open.has(key)) {
      already.push(open.get(key)!);
      continue;
    }
    if (added.length >= room) break;
    // A phone-made id makes a resend harmless.
    if (
      t.id &&
      (await db.houseListItem.findUnique({
        where: { id: t.id },
        select: { id: true },
      }))
    )
      continue;
    const row = await db.houseListItem.create({
      data: {
        ...(t.id ? { id: t.id } : {}),
        listId: list.id,
        title: t.title.trim(),
        qty: t.qty ?? null,
        addedById: user.id,
        createdAt: now,
      },
    });
    open.set(key, row.title);
    added.push({ id: row.id, title: row.title });
  }
  if (added.length)
    await db.houseList.update({
      where: { id: list.id },
      data: { updatedAt: now },
    });
  const notices: Notice[] = [];
  if (
    added.length &&
    tripActive(list, now) &&
    list.tripUserId &&
    list.tripUserId !== user.id
  ) {
    const shopper = await db.user.findUnique({
      where: { id: list.tripUserId },
      select: { id: true, language: true },
    });
    if (shopper) {
      const text = addedLine(
        langOf(shopper),
        user.name,
        list.name,
        added.map((a) => a.title),
      );
      // One line per add, so the shopper sees each one as it comes.
      await postUpdate(
        db,
        shopper.id,
        `list:${list.id}:add:${added[0]!.id}`,
        text,
        now,
      );
      notices.push({ userId: shopper.id, text });
    }
  }
  const full = await db.houseList.findUniqueOrThrow({
    where: { id: list.id },
    include: withItems(now),
  });
  return { list: full, added, already, notices };
}

/** Tick or untick one item. Anyone who sees the list can. */
export async function setDone(
  db: Db,
  userId: string,
  listId: string,
  itemId: string,
  done: boolean,
  now: Date,
): Promise<boolean> {
  const n = await db.houseListItem.updateMany({
    where: { id: itemId, listId, list: visibleLists(userId) },
    data: done
      ? { doneAt: now, doneById: userId }
      : { doneAt: null, doneById: null },
  });
  if (n.count)
    await db.houseList.update({
      where: { id: listId },
      data: { updatedAt: now },
    });
  return n.count > 0;
}

/**
 * Tick things off by name ("got the eggs"): the open items whose folded name matches, or
 * contains / is contained by the name. Returns the titles ticked.
 */
export async function doneByName(
  db: Db,
  userId: string,
  listId: string,
  names: string[],
  now: Date,
): Promise<{ id: string; title: string }[]> {
  const open = await db.houseListItem.findMany({
    where: { listId, doneAt: null, list: visibleLists(userId) },
    select: { id: true, title: true },
  });
  const hit: { id: string; title: string }[] = [];
  for (const n of names) {
    const key = foldThing(n);
    if (!key) continue;
    const exact = open.find(
      (i) => foldThing(i.title) === key && !hit.some((h) => h.id === i.id),
    );
    const near =
      exact ??
      open.find(
        (i) =>
          !hit.some((h) => h.id === i.id) &&
          (foldThing(i.title).includes(key) ||
            key.includes(foldThing(i.title))),
      );
    if (near) hit.push(near);
  }
  if (hit.length) {
    await db.houseListItem.updateMany({
      where: { id: { in: hit.map((h) => h.id) } },
      data: { doneAt: now, doneById: userId },
    });
    await db.houseList.update({
      where: { id: listId },
      data: { updatedAt: now },
    });
  }
  return hit;
}

/**
 * "I'm going to the market" (going) or "I'm back" (not going). Starting tells every other member
 * in their chat and by push, so they add what they need; coming back tells them in the chat only,
 * with how many things were got. A private list just remembers the trip.
 */
export async function setTrip(
  db: Db,
  user: Actor,
  listId: string,
  going: boolean,
  now: Date,
): Promise<{ list: ListWithItems; notices: Notice[] } | null> {
  const list = await db.houseList.findFirst({
    where: { id: listId, ...visibleLists(user.id) },
  });
  if (!list) return null;
  const notices: Notice[] = [];
  const others = await othersOf(db, list, user.id);
  if (going) {
    const fresh = tripActive(list, now) && list.tripUserId === user.id;
    await db.houseList.update({
      where: { id: list.id },
      data: {
        tripUserId: user.id,
        tripAt: fresh ? list.tripAt : now,
        updatedAt: now,
      },
    });
    if (!fresh) {
      for (const o of others) {
        const text = tripStartLine(langOf(o), user.name, list.name);
        await postUpdate(
          db,
          o.id,
          `list:${list.id}:trip:${now.getTime()}`,
          text,
          now,
          [
            {
              id: `list-open-${list.id}-${now.getTime()}`,
              kind: "open_screen",
              status: "done",
              label:
                langOf(o) === "en"
                  ? `Open ${list.name}`
                  : `افتح «${list.name}»`,
              route: `/list/${list.id}`,
              lang: langOf(o) === "en" ? "english" : "arabic",
            },
          ],
        );
        notices.push({ userId: o.id, text });
      }
    }
  } else if (list.tripUserId === user.id) {
    const since = list.tripAt ?? now;
    const got = await db.houseListItem.count({
      where: { listId: list.id, doneById: user.id, doneAt: { gte: since } },
    });
    await db.houseList.update({
      where: { id: list.id },
      data: { tripUserId: null, tripAt: null, updatedAt: now },
    });
    if (got > 0)
      for (const o of others)
        await postUpdate(
          db,
          o.id,
          `list:${list.id}:back:${now.getTime()}`,
          tripEndLine(langOf(o), user.name, list.name, got),
          now,
        );
  }
  const full = await db.houseList.findUniqueOrThrow({
    where: { id: list.id },
    include: withItems(now),
  });
  return { list: full, notices };
}

/**
 * The list "we need eggs" goes to when no list is named: the grocery list used last, else the
 * grocery list of the user's first family circle, else of their first circle with others in it,
 * else their private one. Made when missing.
 */
export async function defaultList(
  db: Db,
  user: Actor,
  now: Date,
  place: ListPlace = "grocery",
): Promise<{ id: string; name: string; circleId: string | null }> {
  const used = await db.houseList.findFirst({
    where: { place, ...visibleLists(user.id) },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, circleId: true },
  });
  if (used) return used;
  const circles = await db.circle.findMany({
    where: { members: { some: { userId: user.id } } },
    include: { _count: { select: { members: true } } },
    orderBy: { createdAt: "asc" },
    take: 30,
  });
  const home =
    circles.find((c) => c.kind === "family") ??
    circles.find((c) => c._count.members > 1) ??
    null;
  return db.houseList.create({
    data: {
      ownerId: user.id,
      circleId: home?.id ?? null,
      name: defaultListName(place, langOf(user)),
      place,
      createdAt: now,
      updatedAt: now,
    },
    select: { id: true, name: true, circleId: true },
  });
}
