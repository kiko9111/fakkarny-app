import { foldThing, LIST_TITLE_MAX, MAX_ITEMS_PER_ADD, MAX_LIST_ITEMS, TRIP_HOURS } from "@fakkarni/shared";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { postUpdate } from "../daftar/store";
import { webAddedLine, webAllDoneLine } from "../links/rules";
import type { Notice } from "../proactive/notify";
import { langOf } from "../tasks/store";
import { tripActive, withItems, type ListWithItems } from "./store";

/**
 * A household list opened from its no-app link (GET /l/:code): someone without Zaki sees it,
 * ticks what they got and adds what is missing. Whoever holds the link can; the list's people
 * hear about adds in their chat, and get a push when everything has been got.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export const findByCode = (db: Db, code: string, now: Date): Promise<ListWithItems | null> =>
  db.houseList.findUnique({ where: { shareCode: code }, include: withItems(now) });

/** Who hears about the link's activity: every circle member, or the owner of a private list. */
async function peopleOf(db: Db, list: { circleId: string | null; ownerId: string | null }) {
  if (list.circleId) {
    const members = await db.circleMember.findMany({ where: { circleId: list.circleId }, include: { user: { select: { id: true, language: true } } } });
    return members.map((m) => m.user);
  }
  if (!list.ownerId) return [];
  const owner = await db.user.findUnique({ where: { id: list.ownerId }, select: { id: true, language: true } });
  return owner ? [owner] : [];
}

export async function addFromWeb(
  db: Db,
  list: ListWithItems,
  things: { title: string; qty: string | null }[],
  name: string | null,
  now: Date,
): Promise<{ added: string[]; already: string[]; full: boolean; notices: Notice[] }> {
  const openRows = await db.houseListItem.findMany({ where: { listId: list.id, doneAt: null }, select: { title: true } });
  const open = new Map(openRows.map((i) => [foldThing(i.title), i.title]));
  const room = Math.max(0, MAX_LIST_ITEMS - openRows.length);
  const added: { id: string; title: string }[] = [];
  const already: string[] = [];
  let full = false;
  for (const thing of things.slice(0, MAX_ITEMS_PER_ADD)) {
    const title = thing.title.trim().slice(0, LIST_TITLE_MAX);
    const key = foldThing(title);
    if (!key) continue;
    if (open.has(key)) {
      already.push(open.get(key)!);
      continue;
    }
    if (added.length >= room) {
      full = true;
      break;
    }
    const row = await db.houseListItem.create({ data: { listId: list.id, title, qty: thing.qty?.slice(0, 20) ?? null, addedByName: name, createdAt: now } });
    open.set(key, row.title);
    added.push({ id: row.id, title: row.title });
  }
  const notices: Notice[] = [];
  if (added.length) {
    await db.houseList.update({ where: { id: list.id }, data: { updatedAt: now } });
    const titles = added.map((a) => a.title);
    for (const p of await peopleOf(db, list)) {
      const text = webAddedLine(langOf(p), name, list.name, titles);
      await postUpdate(db, p.id, `list:${list.id}:webadd:${added[0]!.id}`, text, now);
      // Only the one out shopping right now is pushed: the rest read it when they open the chat.
      if (tripActive(list, now) && list.tripUserId === p.id) notices.push({ userId: p.id, text });
    }
  }
  return { added: added.map((a) => a.title), already, full, notices };
}

/** Tick or untick one item from the page. The last open item ticked tells the list's people. */
export async function tickFromWeb(
  db: Db,
  list: ListWithItems,
  itemId: string,
  done: boolean,
  name: string | null,
  now: Date,
): Promise<{ changed: boolean; notices: Notice[] }> {
  const n = await db.houseListItem.updateMany({
    where: { id: itemId, listId: list.id, doneAt: done ? null : { not: null } },
    data: done ? { doneAt: now, doneById: null, doneByName: name } : { doneAt: null, doneById: null, doneByName: null },
  });
  if (!n.count) return { changed: false, notices: [] };
  await db.houseList.update({ where: { id: list.id }, data: { updatedAt: now } });
  const notices: Notice[] = [];
  if (done && (await db.houseListItem.count({ where: { listId: list.id, doneAt: null } })) === 0) {
    const got = await db.houseListItem.count({
      where: { listId: list.id, doneById: null, doneAt: { gte: new Date(now.getTime() - TRIP_HOURS * 3600_000) } },
    });
    for (const p of await peopleOf(db, list)) {
      const text = webAllDoneLine(langOf(p), name, list.name, got);
      await postUpdate(db, p.id, `list:${list.id}:webdone:${now.getTime()}`, text, now);
      notices.push({ userId: p.id, text });
    }
  }
  return { changed: true, notices };
}
