import { foldThing, splitThings, type AppAction } from "@fakkarni/shared";
import type { PrismaClient, User } from "../generated/prisma/client";
import type { ReplyLang } from "../pipeline/rules";
import type { Notice } from "../proactive/notify";
import { foldName, LABEL, matchByName, type StoredCard } from "../chat/cards";
import { card, type Ctx, type One } from "../chat/actions";
import {
  addItems,
  defaultList,
  doneByName,
  setTrip,
  visibleLists,
} from "./store";
import { placeOf, readGot, readListMessage } from "./match";
import {
  addLabel,
  addReply,
  doneLabel,
  showReply,
  tripAskLabel,
  tripSentLabel,
} from "./rules";

/**
 * Household lists from the chat: the `list` tool, the model's list items (pipeline step 4) and
 * the rule shortcuts. Adding and ticking off happen at once with an Undo (the list is the
 * family's shared notepad; nobody is messaged unless someone is out shopping for it). Telling
 * the circle "I'm going shopping" waits for the user's OK, as everything that messages people does.
 */

const short = (lang: ReplyLang) => (lang === "english" ? "en" : "ar");

type Visible = {
  id: string;
  name: string;
  place: string;
  circleId: string | null;
  updatedAt: Date;
};

/** The list a name or hint points at, else the household grocery list (made when missing). */
export async function pickList(
  prisma: PrismaClient,
  user: User,
  hint: string | null | undefined,
  now: Date,
): Promise<{ id: string; name: string; circleId: string | null }> {
  if (hint && foldName(hint)) {
    const lists: Visible[] = await prisma.houseList.findMany({
      where: visibleLists(user.id),
      select: {
        id: true,
        name: true,
        place: true,
        circleId: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 60,
    });
    const byName = matchByName(lists, hint, (l) => [l.name]);
    if (byName) return byName;
    const place = placeOf(hint);
    const byPlace = place ? lists.find((l) => l.place === place) : undefined;
    if (byPlace) return byPlace;
    if (place) return defaultList(prisma, user, now, place);
  }
  return defaultList(prisma, user, now);
}

export async function addToList(
  prisma: PrismaClient,
  user: User,
  lang: ReplyLang,
  things: { title: string; qty: string | null }[],
  hint: string | null | undefined,
  now: Date,
): Promise<{ card: StoredCard; reply: string; notices: Notice[] } | null> {
  if (!things.length) return null;
  const target = await pickList(prisma, user, hint, now);
  const out = await addItems(prisma, user, target.id, things, now);
  if (!out) return null;
  const route = `/list/${target.id}`;
  const reply = addReply(
    short(lang),
    target.name,
    out.added.map((a) => a.title),
    out.already,
    Boolean(target.circleId),
  );
  await prisma.event.create({
    data: {
      userId: user.id,
      name: "list_items_added",
      propsJson: {
        count: out.added.length,
        via: "chat",
        shared: Boolean(target.circleId),
      },
    },
  });
  const c = out.added.length
    ? card(
        lang,
        "list_add",
        "done",
        addLabel(
          short(lang),
          target.name,
          out.added.map((a) => a.title),
        ),
        route,
        undefined,
        {
          kind: "list_items",
          listId: target.id,
          itemIds: out.added.map((a) => a.id),
        },
      )
    : card(lang, "list_add", "done", reply, route);
  return { card: c, reply, notices: out.notices };
}

/** The `list` tool's actions (and the model's list items, turned into list_add). */
export async function runListAction(ctx: Ctx, a: AppAction): Promise<One> {
  const { prisma, user, lang, now } = ctx;
  const things = (a.things ?? []).flatMap((t) => splitThings(t)).slice(0, 30);
  switch (a.kind) {
    case "list_add": {
      const out = await addToList(prisma, user, lang, things, a.list, now);
      if (!out)
        return {
          card: card(lang, a.kind, "failed", LABEL.failed(lang), "/list"),
        };
      return { card: out.card, notices: out.notices };
    }
    case "list_done": {
      const target = await pickList(prisma, user, a.list, now);
      const got = await doneByName(
        prisma,
        user.id,
        target.id,
        things.map((t) => t.title),
        now,
      );
      if (!got.length)
        return {
          card: card(
            lang,
            a.kind,
            "failed",
            LABEL.notFound(
              lang,
              "list_item",
              things.map((t) => t.title).join("، "),
            ),
            `/list/${target.id}`,
          ),
        };
      return {
        card: card(
          lang,
          a.kind,
          "done",
          doneLabel(
            short(lang),
            target.name,
            got.map((g) => g.title),
          ),
          `/list/${target.id}`,
          undefined,
          {
            kind: "list_undone",
            listId: target.id,
            itemIds: got.map((g) => g.id),
          },
        ),
      };
    }
    case "list_trip": {
      const target = await pickList(prisma, user, a.list, now);
      return tripCard(prisma, user, lang, target, now);
    }
    default:
      return { card: card(lang, a.kind, "failed", LABEL.failed(lang)) };
  }
}

/** A circle list: a waiting card (the others are told). A private list: the trip is just noted. */
async function tripCard(
  prisma: PrismaClient,
  user: User,
  lang: ReplyLang,
  target: { id: string; name: string; circleId: string | null },
  now: Date,
): Promise<One> {
  const route = `/list/${target.id}`;
  const others = target.circleId
    ? await prisma.circleMember.count({
        where: { circleId: target.circleId, userId: { not: user.id } },
      })
    : 0;
  if (!others) {
    await setTrip(prisma, user, target.id, true, now);
    return {
      card: card(
        lang,
        "list_trip",
        "done",
        LABEL.open(lang, target.name),
        route,
      ),
    };
  }
  return {
    card: card(
      lang,
      "list_trip",
      "pending",
      tripAskLabel(short(lang), target.name),
      route,
      { kind: "list_trip", listId: target.id },
    ),
  };
}

/** The user's OK on "tell the circle I'm going shopping". */
export async function confirmTrip(
  prisma: PrismaClient,
  user: User,
  c: StoredCard,
  listId: string,
  now: Date,
): Promise<{ card: StoredCard; notices: Notice[] }> {
  const { payload: _drop, ...rest } = c;
  const out = await setTrip(prisma, user, listId, true, now);
  if (!out)
    return {
      card: {
        ...rest,
        status: "failed",
        label: LABEL.notFound(c.lang, "list"),
      },
      notices: [],
    };
  await prisma.event.create({
    data: {
      userId: user.id,
      name: "list_trip",
      propsJson: { via: "chat", told: out.notices.length },
    },
  });
  return {
    card: {
      ...rest,
      status: "done",
      label: tripSentLabel(short(c.lang), out.list.name),
    },
    notices: out.notices.filter((n) => n.userId !== user.id),
  };
}

/**
 * Rule shortcuts, no AI call (pipeline step 1a″): "ضيف بيض للقايمة", "القايمة فيها ايه",
 * "نازل السوبر ماركت", and "جبت العيش" when every thing named is open on the list.
 */
export async function listFastPath(
  prisma: PrismaClient,
  user: User,
  text: string,
  lang: ReplyLang,
  now: Date,
): Promise<{ text: string; cards: StoredCard[]; notices: Notice[] } | null> {
  const intent = readListMessage(text);
  if (intent?.kind === "add") {
    const out = await addToList(
      prisma,
      user,
      lang,
      intent.things,
      intent.hint,
      now,
    );
    return out
      ? { text: out.reply, cards: [out.card], notices: out.notices }
      : null;
  }
  if (intent?.kind === "show") {
    const target = await pickList(prisma, user, intent.hint, now);
    const open = await prisma.houseListItem.findMany({
      where: { listId: target.id, doneAt: null },
      orderBy: { createdAt: "asc" },
      select: { title: true, qty: true },
    });
    return {
      text: showReply(
        short(lang),
        target.name,
        open.map((i) => (i.qty ? `${i.title} (${i.qty})` : i.title)),
      ),
      cards: [
        card(
          lang,
          "open_screen",
          "done",
          LABEL.open(lang, target.name),
          `/list/${target.id}`,
        ),
      ],
      notices: [],
    };
  }
  if (intent?.kind === "trip") {
    const target = await pickList(prisma, user, intent.hint, now);
    const open = await prisma.houseListItem.findMany({
      where: { listId: target.id, doneAt: null },
      orderBy: { createdAt: "asc" },
      select: { title: true },
    });
    const one = await tripCard(prisma, user, lang, target, now);
    const lines = showReply(
      short(lang),
      target.name,
      open.map((i) => i.title),
    );
    const ask =
      one.card.status === "pending"
        ? lang === "english"
          ? "\nShall I tell the circle, so they can add what they need?"
          : "\nأقول للدايرة عشان يضيفوا اللي محتاجينه وقت المشوار؟"
        : "";
    return { text: `${lines}${ask}`, cards: [one.card], notices: [] };
  }
  const got = readGot(text);
  if (got) {
    // Only when every thing named is open on one of their lists: "جبت درجة كويسة" is not shopping.
    const lists = await prisma.houseList.findMany({
      where: visibleLists(user.id),
      select: {
        id: true,
        name: true,
        items: { where: { doneAt: null }, select: { title: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
    });
    const hit = lists.find((l) =>
      got.every((g) =>
        l.items.some(
          (i) =>
            foldThing(i.title) === foldThing(g) ||
            foldThing(i.title).includes(foldThing(g)),
        ),
      ),
    );
    if (!hit) return null;
    const done = await doneByName(prisma, user.id, hit.id, got, now);
    if (!done.length) return null;
    const left = hit.items.length - done.length;
    const words = done.map((d) => d.title);
    const reply =
      lang === "english"
        ? `Ticked off ${words.join(", ")} ✅${left > 0 ? ` ${left} left on ${hit.name}.` : ` ${hit.name} is done 🎉`}`
        : `شطبت ${words.join("، ")} ✅${left > 0 ? ` فاضل ${left} في «${hit.name}».` : ` «${hit.name}» خلصت 🎉`}`;
    return {
      text: reply,
      cards: [
        card(
          lang,
          "list_done",
          "done",
          doneLabel(short(lang), hit.name, words),
          `/list/${hit.id}`,
          undefined,
          {
            kind: "list_undone",
            listId: hit.id,
            itemIds: done.map((d) => d.id),
          },
        ),
      ],
      notices: [],
    };
  }
  return null;
}
