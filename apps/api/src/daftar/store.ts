import { currencyOf } from "@fakkarni/shared";
import type { DaftarEntry as WireEntry } from "@fakkarni/shared";
import { Prisma as PrismaNs, type DaftarEntry, type Prisma, type PrismaClient, type User } from "../generated/prisma/client";
import { newInviteCode } from "../circles/rules";
import { activityCard, LABEL } from "../chat/cards";
import { flip, formatAmount, updateLine, type Lang } from "./rules";

type Db = PrismaClient | Prisma.TransactionClient;
export type EntryWithPeople = DaftarEntry & { creator: Pick<User, "id" | "name" | "instapayLink" | "language">; other: Pick<User, "id" | "name" | "instapayLink" | "language"> | null };

export const withPeople = {
  creator: { select: { id: true, name: true, instapayLink: true, language: true } },
  other: { select: { id: true, name: true, instapayLink: true, language: true } },
} as const;

export const daftarUrl = (base: string, code: string) => `${base}/d/${code}`;
const langOf = (u: { language: string }): Lang => (u.language === "en" ? "en" : "ar");

/** The entry as one of its two people sees it (direction and names from their side). */
export function toWireEntry(e: EntryWithPeople, viewerId: string, base: string): WireEntry {
  const mine = e.creatorId === viewerId;
  const direction = mine ? e.direction : flip(e.direction);
  const owed = e.direction === "owed_to_me" ? e.creator : e.other;
  return {
    id: e.id,
    other_name: mine ? e.other?.name ?? e.otherName : e.creator.name ?? (langOf(e.other ?? e.creator) === "en" ? "Your friend" : "صاحبك"),
    direction,
    amount: Number(e.amount),
    currency: e.currency,
    note: e.note,
    status: e.status,
    mine,
    url: mine ? daftarUrl(base, e.code) : null,
    pay_link: direction === "i_owe" && e.status !== "settled" && e.status !== "cancelled" ? owed?.instapayLink ?? null : null,
    circle_id: e.circleId,
    created_at: e.createdAt.toISOString(),
    responded_at: e.respondedAt?.toISOString() ?? null,
    settled_at: e.settledAt?.toISOString() ?? null,
  };
}

/** Zaki tells someone, in their own chat, that something happened. Free: no AI call. */
/** A chat line from Zaki about what someone else did. `cards` lets the reader answer it right there. */
export async function postUpdate(db: Db, userId: string, clientId: string, text: string, now: Date, cards?: Prisma.InputJsonValue[]) {
  await db.message.createMany({ data: [{ userId, role: "friend", kind: "update", text, clientId, createdAt: now, ...(cards?.length ? { actionsJson: cards } : {}) }], skipDuplicates: true });
}

/**
 * The other person answers (from the web page or the app). Only a pending entry can be
 * answered, and only once. Returns the updated entry, or null if it was no longer pending.
 */
export async function respond(prisma: PrismaClient, entryId: string, answer: "confirm" | "dispute", via: "web" | "app", now: Date): Promise<EntryWithPeople | null> {
  return prisma.$transaction(async (tx) => {
    const status = answer === "confirm" ? "confirmed" : "disputed";
    const changed = await tx.daftarEntry.updateMany({ where: { id: entryId, status: "pending" }, data: { status, respondedAt: now, respondedVia: via } });
    if (changed.count === 0) return null;
    const e = await tx.daftarEntry.findUniqueOrThrow({ where: { id: entryId }, include: withPeople });
    await postUpdate(tx, e.creatorId, `daftar:${e.id}:${status}`, updateLine(langOf(e.creator), status, e.other?.name ?? e.otherName, Number(e.amount), e.currency), now);
    await tx.event.create({ data: { userId: e.creatorId, name: `daftar_${status}`, propsJson: { via } } });
    return e;
  });
}

/** Either person marks it paid. The other one hears about it from Zaki. */
export async function settle(prisma: PrismaClient, entryId: string, byUserId: string, now: Date): Promise<EntryWithPeople | null> {
  return prisma.$transaction(async (tx) => {
    const changed = await tx.daftarEntry.updateMany({ where: { id: entryId, status: { in: ["pending", "confirmed"] } }, data: { status: "settled", settledAt: now } });
    if (changed.count === 0) return null;
    const e = await tx.daftarEntry.findUniqueOrThrow({ where: { id: entryId }, include: withPeople });
    const tell = e.creatorId === byUserId ? e.other : e.creator;
    const about = e.creatorId === byUserId ? e.creator.name ?? e.otherName : e.other?.name ?? e.otherName;
    if (tell) await postUpdate(tx, tell.id, `daftar:${e.id}:settled`, updateLine(langOf(tell), "settled", about, Number(e.amount), e.currency), now);
    await tx.event.create({ data: { userId: byUserId, name: "daftar_settled", propsJson: {} } });
    return e;
  });
}

/**
 * Record a debt between the creator and one person. A circle member sees it in their app and
 * hears about it in their chat; anyone else gets the confirm link the creator sends from their
 * own WhatsApp. Shared by POST /daftar and the chat (chat/more-actions.ts).
 */
export async function createEntry(
  prisma: PrismaClient,
  creator: Pick<User, "id" | "name" | "city">,
  b: { circleId: string | null; otherName: string; otherUserId: string | null; direction: "owed_to_me" | "i_owe"; amount: number; note: string | null },
  now: Date,
): Promise<EntryWithPeople> {
  let entry: EntryWithPeople | null = null;
  for (let attempt = 0; !entry; attempt++) {
    try {
      entry = await prisma.daftarEntry.create({
        data: { code: newInviteCode(), creatorId: creator.id, circleId: b.circleId, otherName: b.otherName, otherUserId: b.otherUserId, direction: b.direction, amount: new PrismaNs.Decimal(b.amount), currency: currencyOf(creator.city).code, note: b.note, createdAt: now },
        include: withPeople,
      });
    } catch (err) {
      if (attempt < 4 && err instanceof PrismaNs.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
  await prisma.event.create({ data: { userId: creator.id, name: "daftar_created", propsJson: { in_circle: Boolean(b.circleId), to_member: Boolean(b.otherUserId) } } });
  if (entry.other) {
    const lang = langOf(entry.other);
    const money = formatAmount(b.amount, entry.currency, lang);
    const name = creator.name ?? (lang === "en" ? "Someone in your circle" : "حد من دايرتك");
    // From the reader's side; no gendered verb about the other person in Arabic.
    const owesReader = entry.direction === "i_owe";
    const line =
      lang === "en"
        ? `${name} put ${money} in the Daftar: ${owesReader ? `${name} owes you` : `you owe ${name}`}${entry.note ? ` (${entry.note})` : ""}.`
        : `في الدفتر من ${name}: ${money}، ${owesReader ? `ليك عند ${name}` : `عليك لـ ${name}`}${entry.note ? ` (${entry.note})` : ""}.`;
    const rl = lang === "en" ? "english" : "arabic";
    const card = activityCard(rl, "daftar_answer", LABEL.daftarCard(rl, b.amount), `/daftar/${entry.code}`, { kind: "daftar_answer", entryId: entry.id, answer: "confirm" }, { kind: "daftar_answer", entryId: entry.id, answer: "dispute" });
    await postUpdate(prisma, entry.other.id, `daftar:${entry.id}:new`, line, now, [card as unknown as Prisma.InputJsonValue]);
  }
  return entry;
}

/** The creator cancels an entry that is still pending or disputed. False when it can't be. */
export async function cancelEntry(prisma: PrismaClient, entryId: string): Promise<boolean> {
  const changed = await prisma.daftarEntry.updateMany({ where: { id: entryId, status: { in: ["pending", "disputed"] } }, data: { status: "cancelled" } });
  return changed.count > 0;
}
