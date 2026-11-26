import type { SplitInput } from "@fakkarni/shared";
import type { Prisma, PrismaClient, Split as SplitRow, User } from "../generated/prisma/client";
import { activityCard } from "../chat/cards";
import { formatAmount, type Lang } from "../daftar/rules";
import { postUpdate } from "../daftar/store";
import type { Notice } from "../proactive/notify";
import { memberPaidLine, memberShareLine } from "./rules";

/**
 * Group splits: a bill split inside a circle. People with a `user_id` are members of that circle;
 * each one (besides whoever made it) sees the split in their app and gets their share in their
 * own Zaki chat with an "I paid" card. Template words only, no AI call, free. Records only.
 */
type Db = PrismaClient | Prisma.TransactionClient;

const langOf = (u: { language: string }): Lang => (u.language === "en" ? "en" : "ar");

/**
 * Keep only user ids that belong to the split's circle (one row per member), and the ids that
 * should see it. Without a circle every user id is dropped. Null when the caller is not a member
 * of the circle they named.
 */
export async function groupOf(db: Db, creatorId: string, input: SplitInput): Promise<{ input: SplitInput; circleId: string | null; memberIds: string[] } | null> {
  if (!input.circle_id) return { input: { ...input, people: input.people.map(({ name }) => ({ name })) }, circleId: null, memberIds: [] };
  const members = await db.circleMember.findMany({ where: { circleId: input.circle_id }, select: { userId: true } });
  const ids = new Set(members.map((m) => m.userId));
  if (!ids.has(creatorId)) return null;
  const seen = new Set<string>();
  const people = input.people.map(({ name, user_id }) => {
    if (!user_id || !ids.has(user_id) || seen.has(user_id)) return { name };
    seen.add(user_id);
    return { name, user_id };
  });
  return { input: { ...input, people }, circleId: input.circle_id, memberIds: [...seen].filter((id) => id !== creatorId) };
}

/** Did the person who made the split pay the bill? (They are row 0 unless their row is linked.) */
export function payerIsCreator(row: Pick<SplitRow, "paidBy" | "peopleJson" | "userId">): boolean {
  if (row.paidBy === null) return false;
  const people = row.peopleJson as { user_id?: string | null }[];
  const linked = people.findIndex((p) => p.user_id === row.userId);
  return linked >= 0 ? linked === row.paidBy : row.paidBy === 0;
}

/** The payer's InstaPay link to show the others: only the creator's own, saved in Settings. */
export const instapayFor = (row: Pick<SplitRow, "paidBy" | "peopleJson" | "userId">, creator: Pick<User, "instapayLink">) =>
  payerIsCreator(row) ? creator.instapayLink ?? null : null;

/**
 * Tell each member their share, in their chat (kind "update", once per split and member). Members
 * who owe the payer get an "I paid" card. Returns the push notices.
 */
export async function tellMembers(db: Db, row: SplitRow, creator: Pick<User, "name">, now: Date): Promise<Notice[]> {
  if (!row.memberIds.length) return [];
  const users = await db.user.findMany({ where: { id: { in: row.memberIds } }, select: { id: true, language: true } });
  const people = row.peopleJson as { name: string; share: number; user_id?: string | null }[];
  const payer = row.paidBy !== null ? people[row.paidBy] : undefined;
  const notices: Notice[] = [];
  for (const u of users) {
    const index = people.findIndex((p) => p.user_id === u.id);
    if (index < 0) continue;
    const lang = langOf(u);
    const owes = row.paidBy !== null && index !== row.paidBy && people[index]!.share > 0;
    const text = memberShareLine(lang, {
      title: row.title,
      from: creator.name ?? (lang === "en" ? "Someone" : "حد"),
      share: formatAmount(people[index]!.share, row.currency, lang),
      payer: index === row.paidBy ? "me" : payer?.name ?? null,
    });
    const card = owes
      ? activityCard(lang === "en" ? "english" : "arabic", "split_paid", lang === "en" ? "Did you pay your share?" : "دفعت نصيبك؟", `/split/${row.id}`, { kind: "split_i_paid", splitId: row.id })
      : undefined;
    await postUpdate(db, u.id, `split:${row.id}:share:${u.id}`, text, now, card ? [card as unknown as Prisma.InputJsonValue] : undefined);
    notices.push({ userId: u.id, text });
  }
  return notices;
}

/**
 * Mark one person's share paid and tell the creator, when someone other than the creator did it
 * (a member in the app, or a friend on the web page). Null when there is nothing to do.
 */
export async function markPaid(db: Db, row: SplitRow, index: number, now: Date, by: "member" | "web"): Promise<{ row: SplitRow; notices: Notice[] } | null> {
  const people = row.peopleJson as { name: string; share: number; paid: boolean }[];
  const p = people[index];
  if (!p || index === row.paidBy || p.paid) return null;
  people[index] = { ...p, paid: true };
  const updated = await db.split.update({ where: { id: row.id }, data: { peopleJson: people } });
  const owner = await db.user.findUnique({ where: { id: row.userId }, select: { language: true } });
  if (!owner) return { row: updated, notices: [] };
  const lang = langOf(owner);
  const text = memberPaidLine(lang, { title: row.title, name: p.name, share: formatAmount(p.share, row.currency, lang), web: by === "web" });
  await postUpdate(db, row.userId, `split:${row.id}:paid:${index}`, text, now);
  await db.event.create({ data: { userId: row.userId, name: "split_member_paid", propsJson: { via: by } } });
  return { row: updated, notices: [{ userId: row.userId, text }] };
}
