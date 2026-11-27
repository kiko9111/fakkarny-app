import { monthOfRound, roundAt, roundState, type CreateGameyaRequest, type Gameya, type GameyaMemberInput } from "@fakkarni/shared";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { card } from "../chat/actions";
import { LABEL } from "../chat/cards";
import { postUpdate } from "../daftar/store";
import type { Lang } from "../daftar/rules";
import { toLocalIso } from "../lib/time";
import type { Notice } from "../proactive/notify";
import { allPaidLine, joinedLine, memberPaidLine, ownerTickedLine, receivedLine } from "./rules";

/**
 * Reads and writes for the gam'eya book. A gam'eya is seen by its organizer and by every member
 * who is a Zaki user; everyone else sees the public page /g/:code. Template words only, free.
 */
type Db = PrismaClient | Prisma.TransactionClient;

export const withBook = {
  members: { orderBy: { turn: "asc" as const } },
  payments: { select: { memberId: true, round: true } },
  owner: { select: { id: true, name: true, instapayLink: true, language: true, timezone: true } },
  circle: { select: { name: true } },
} satisfies Prisma.GameyaInclude;

export type BookRow = Prisma.GameyaGetPayload<{ include: typeof withBook }>;

export const visibleGameyas = (userId: string) => ({ OR: [{ ownerId: userId }, { members: { some: { userId } } }] });

const langOf = (u: { language: string }): Lang => (u.language === "en" ? "en" : "ar");

/** The wire shape for one reader (`me` null: the public page). */
export function toWireGameya(row: BookRow, base: string, me: string | null, now: Date): Gameya {
  const months = row.members.length;
  // "Today" is the organizer's: one calendar for everyone in the book.
  const today = toLocalIso(now, row.owner.timezone).slice(0, 10);
  return {
    id: row.id,
    name: row.name,
    amount: row.amount,
    currency: row.currency,
    pay_day: row.payDay,
    start_month: row.startMonth,
    months,
    pot: row.amount * months,
    circle_id: row.circleId,
    circle_name: row.circle?.name ?? null,
    code: row.code,
    url: `${base}/g/${row.code}`,
    mine: me !== null && row.ownerId === me,
    owner_name: row.owner.name,
    instapay: row.owner.instapayLink,
    members: row.members.map((m) => ({
      id: m.id,
      name: m.name,
      user_id: me ? m.userId : null,
      turn: m.turn,
      month: monthOfRound(row.startMonth, m.turn),
      received: m.receivedAt !== null,
      is_me: me !== null && m.userId === me,
    })),
    payments: row.payments.map((p) => ({ member_id: p.memberId, round: p.round })),
    round: roundAt(row.startMonth, today),
    created_at: row.createdAt.toISOString(),
  };
}

export const readBook = (db: Db, id: string, userId: string) => db.gameya.findFirst({ where: { id, ...visibleGameyas(userId) }, include: withBook });

/**
 * Keep a user id only for the organizer and members of the gam'eya's circle (each user once).
 * Null when the organizer names a circle they are not in.
 */
export async function cleanMembers(db: Db, ownerId: string, circleId: string | null, members: GameyaMemberInput[]): Promise<GameyaMemberInput[] | null> {
  let allowed = new Set([ownerId]);
  if (circleId) {
    const rows = await db.circleMember.findMany({ where: { circleId }, select: { userId: true } });
    if (!rows.some((r) => r.userId === ownerId)) return null;
    allowed = new Set(rows.map((r) => r.userId));
  }
  const seen = new Set<string>();
  return members.map(({ id, name, user_id }) => {
    if (!user_id || !allowed.has(user_id) || seen.has(user_id)) return { ...(id ? { id } : {}), name, user_id: null };
    seen.add(user_id);
    return { ...(id ? { id } : {}), name, user_id };
  });
}

export const memberRows = (gameyaId: string, members: GameyaMemberInput[]) =>
  members.map((m, i) => ({ ...(m.id ? { id: m.id } : {}), gameyaId, name: m.name, userId: m.user_id ?? null, turn: i + 1 }));

export async function createBook(db: Db, ownerId: string, body: CreateGameyaRequest, members: GameyaMemberInput[], code: string, now: Date) {
  const { id } = await db.gameya.create({
    data: {
      ...(body.id ? { id: body.id } : {}),
      ownerId,
      circleId: body.circle_id,
      name: body.name,
      amount: body.amount,
      payDay: body.pay_day,
      startMonth: body.start_month,
      code,
      createdAt: now,
      updatedAt: now,
      members: { create: members.map((m, i) => ({ ...(m.id ? { id: m.id } : {}), name: m.name, userId: m.user_id ?? null, turn: i + 1, createdAt: now })) },
    },
    select: { id: true },
  });
  return db.gameya.findUniqueOrThrow({ where: { id }, include: withBook });
}

const openCard = (lang: Lang, row: Pick<BookRow, "id" | "name">) => card(lang === "en" ? "english" : "arabic", "open_screen", "done", LABEL.open(lang === "en" ? "english" : "arabic", row.name), `/gameya/${row.id}`);

/** Each Zaki member besides the organizer hears they are in, with their turn (once per gam'eya). */
export async function tellJoined(db: Db, row: BookRow, now: Date, only?: Set<string>): Promise<Notice[]> {
  const others = row.members.filter((m) => m.userId && m.userId !== row.ownerId && (!only || only.has(m.userId)));
  if (!others.length) return [];
  const users = await db.user.findMany({ where: { id: { in: others.map((m) => m.userId!) } }, select: { id: true, language: true } });
  const wire = toWireGameya(row, "", null, now);
  const notices: Notice[] = [];
  for (const u of users) {
    const m = others.find((o) => o.userId === u.id)!;
    const lang = langOf(u);
    const text = joinedLine(lang, wire, row.owner.name, m.turn, monthOfRound(row.startMonth, m.turn));
    await postUpdate(db, u.id, `gameya:${row.id}:joined:${u.id}`, text, now, [openCard(lang, row) as unknown as Prisma.InputJsonValue]);
    notices.push({ userId: u.id, text });
  }
  return notices;
}

/**
 * Record or remove one payment. `by` says who did it: the organizer, the member themself in the
 * app, or someone on the public page. The others hear about it in their chat. Returns null when
 * nothing changed (already as asked).
 */
export async function setPaid(db: PrismaClient, row: BookRow, memberId: string, round: number, paid: boolean, by: "owner" | "member" | "web", now: Date): Promise<{ row: BookRow; notices: Notice[] } | null> {
  const member = row.members.find((m) => m.id === memberId);
  if (!member) return null;
  if (!paid) {
    const n = await db.gameyaPayment.deleteMany({ where: { memberId, round } });
    if (!n.count) return null;
    return { row: (await db.gameya.findUniqueOrThrow({ where: { id: row.id }, include: withBook })), notices: [] };
  }
  const made = await db.gameyaPayment.createMany({ data: [{ gameyaId: row.id, memberId, round, markedBy: by, createdAt: now }], skipDuplicates: true });
  if (!made.count) return null;
  const fresh = await db.gameya.findUniqueOrThrow({ where: { id: row.id }, include: withBook });
  const wire = toWireGameya(fresh, "", null, now);
  const state = roundState(wire, round);
  const month = monthOfRound(row.startMonth, round);
  const notices: Notice[] = [];
  const owner = row.owner;
  const ownerLang = langOf(owner);
  if (by !== "owner" && member.userId !== row.ownerId) {
    const text = memberPaidLine(ownerLang, wire, member.name, month, by === "web", state.paid.length, wire.members.length);
    await postUpdate(db, row.ownerId, `gameya:${row.id}:paid:${memberId}:${round}`, text, now, [openCard(ownerLang, row) as unknown as Prisma.InputJsonValue]);
    notices.push({ userId: row.ownerId, text });
  }
  if (by === "owner" && member.userId && member.userId !== row.ownerId) {
    // A quiet confirmation in their chat: no push for this one.
    const u = await db.user.findUnique({ where: { id: member.userId }, select: { language: true } });
    if (u) await postUpdate(db, member.userId, `gameya:${row.id}:ticked:${memberId}:${round}`, ownerTickedLine(langOf(u), wire, month), now);
  }
  if (state.allPaid) {
    const text = allPaidLine(ownerLang, wire, month, state.receiver?.name ?? null);
    await postUpdate(db, row.ownerId, `gameya:${row.id}:${round}:allpaid`, text, new Date(now.getTime() + 1));
    if (by !== "owner") notices.push({ userId: row.ownerId, text });
  }
  await db.event.create({ data: { userId: row.ownerId, name: "gameya_paid", propsJson: { via: by } } });
  return { row: fresh, notices };
}

/** The pot of a round handed over (or taken back). The organizer or the receiver says it. */
export async function setReceived(db: PrismaClient, row: BookRow, round: number, received: boolean, byUserId: string, now: Date): Promise<{ row: BookRow; notices: Notice[] } | null> {
  const receiver = row.members.find((m) => m.turn === round);
  if (!receiver || (receiver.receivedAt !== null) === received) return null;
  await db.gameyaMember.update({ where: { id: receiver.id }, data: { receivedAt: received ? now : null } });
  const fresh = await db.gameya.findUniqueOrThrow({ where: { id: row.id }, include: withBook });
  if (!received) return { row: fresh, notices: [] };
  const wire = toWireGameya(fresh, "", null, now);
  const month = monthOfRound(row.startMonth, round);
  const notices: Notice[] = [];
  const tellId = byUserId === row.ownerId ? receiver.userId : row.ownerId;
  if (tellId && tellId !== byUserId) {
    const u = await db.user.findUnique({ where: { id: tellId }, select: { language: true } });
    if (u) {
      const text = receivedLine(langOf(u), wire, month, tellId === receiver.userId, receiver.name);
      await postUpdate(db, tellId, `gameya:${row.id}:${round}:received`, text, now);
      notices.push({ userId: tellId, text });
    }
  }
  return { row: fresh, notices };
}
