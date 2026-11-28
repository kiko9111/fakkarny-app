import type { CheckinKind } from "@fakkarni/shared";
import type { PrismaClient, User } from "../generated/prisma/client";
import { postUpdate } from "../daftar/store";
import type { Notice } from "../proactive/notify";
import { CHECKIN_ASK_GAP_HOURS, checkinAskLine, postLine } from "../tasks/rules";
import { langOf } from "../tasks/store";

/**
 * Circle actions shared by the routes and the chat (chat/more-actions.ts). Each returns the
 * pushes to send; the caller sends them. Words come from templates, never the model.
 */

type Actor = Pick<User, "id" | "name">;

/**
 * One check-in: the member's own words, shown in the circle, written into the others' chats
 * (owner ask 2026-11-23: "Zaki tells me in the chat when others do something") and pushed.
 * Never a location.
 */
export async function postCheckin(prisma: PrismaClient, circleId: string, user: Actor, kind: CheckinKind, note: string | null, now: Date): Promise<{ notices: Notice[] } | null> {
  const circle = await prisma.circle.findFirst({ where: { id: circleId, members: { some: { userId: user.id } } }, include: { members: { include: { user: { select: { id: true, language: true } } } } } });
  if (!circle) return null;
  const event = `checkin:${kind}`;
  const post = await prisma.circlePost.create({ data: { circleId: circle.id, event, actorId: user.id, title: note, createdAt: now } });
  await prisma.event.create({ data: { userId: user.id, name: "checkin", propsJson: { kind } } });
  const notices: Notice[] = [];
  for (const m of circle.members) {
    if (m.userId === user.id) continue;
    const text = `${circle.name}: ${postLine(langOf(m.user), event, user.name, null, note)}`;
    await postUpdate(prisma, m.userId, `checkin:${post.id}`, text, now);
    notices.push({ userId: m.userId, text });
  }
  return { notices };
}

/** "Ask them to check in": at most once every few hours per pair. */
export async function askCheckin(prisma: PrismaClient, circleId: string, user: Actor, targetId: string, now: Date): Promise<{ notices: Notice[] } | "too_soon" | null> {
  if (targetId === user.id) return null;
  const circle = await prisma.circle.findFirst({ where: { id: circleId, members: { some: { userId: user.id } } }, include: { members: { where: { userId: targetId }, include: { user: true } } } });
  const target = circle?.members[0]?.user;
  if (!circle || !target) return null;
  const bucket = Math.floor(now.getTime() / (CHECKIN_ASK_GAP_HOURS * 3600_000));
  const clientId = `checkin_ask:${circleId}:${user.id}:${bucket}`;
  if (await prisma.message.findUnique({ where: { userId_clientId: { userId: target.id, clientId } } })) return "too_soon";
  const text = checkinAskLine(langOf(target), user.name, circle.name);
  await postUpdate(prisma, target.id, clientId, text, now);
  await prisma.event.create({ data: { userId: user.id, name: "checkin_asked", propsJson: {} } });
  return { notices: [{ userId: target.id, text }] };
}

/** Remove a member (the owner) or leave (yourself). When the owner leaves, the longest-standing member takes over. */
export async function removeMember(prisma: PrismaClient, circleId: string, userId: string, now: Date): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const target = await tx.circleMember.findUnique({ where: { circleId_userId: { circleId, userId } } });
    if (!target) return;
    await tx.circleMember.delete({ where: { circleId_userId: { circleId, userId } } });
    await tx.tracker.updateMany({ where: { userId, circleId }, data: { circleId: null } });
    await tx.invite.updateMany({ where: { circleId, inviterId: userId, revokedAt: null }, data: { revokedAt: now } });
    // Care circles: no more reminders for someone who left, and their medicines no longer point at their account.
    await tx.$executeRaw`UPDATE care_meds SET remind_user_ids = array_remove(remind_user_ids, ${userId}::uuid) WHERE circle_id = ${circleId}::uuid AND ${userId}::uuid = ANY(remind_user_ids)`;
    await tx.careMed.updateMany({ where: { circleId, personUserId: userId }, data: { personUserId: null } });
    const next = await tx.circleMember.findFirst({ where: { circleId }, orderBy: [{ joinedAt: "asc" }, { userId: "asc" }] });
    if (!next) await tx.circle.delete({ where: { id: circleId } });
    else if (target.role === "owner") await tx.circleMember.update({ where: { circleId_userId: { circleId, userId: next.userId } }, data: { role: "owner" } });
  });
}

/** An iftar invitation to the whole circle: a post everyone can answer, a chat line and a push. */
export async function inviteToIftar(prisma: PrismaClient, circleId: string, user: Actor, on: string, note: string | null, now: Date): Promise<{ postId: string; notices: Notice[] } | null> {
  const circle = await prisma.circle.findFirst({ where: { id: circleId, members: { some: { userId: user.id } } }, include: { members: { include: { user: { select: { language: true } } } } } });
  if (!circle) return null;
  const title = `${on}|${note ?? ""}`;
  const post = await prisma.circlePost.create({ data: { circleId: circle.id, event: "iftar", actorId: user.id, title, createdAt: now } });
  await prisma.event.create({ data: { userId: user.id, name: "iftar_invite", propsJson: {} } });
  const notices: Notice[] = [];
  for (const m of circle.members) {
    if (m.userId === user.id) continue;
    const text = `${circle.name}: ${postLine(langOf(m.user), "iftar", user.name, null, title)}`;
    await postUpdate(prisma, m.userId, `iftar:${post.id}`, text, now);
    notices.push({ userId: m.userId, text });
  }
  return { postId: post.id, notices };
}

/** Someone joined: the others hear it in their chat (owner ask 2026-11-23). */
export async function announceJoin(prisma: PrismaClient, circleId: string, joiner: Actor, now: Date): Promise<Notice[]> {
  const circle = await prisma.circle.findUnique({ where: { id: circleId }, include: { members: { include: { user: { select: { language: true } } } } } });
  if (!circle) return [];
  const notices: Notice[] = [];
  for (const m of circle.members) {
    if (m.userId === joiner.id) continue;
    const lang = langOf(m.user);
    const who = joiner.name ?? (lang === "en" ? "Someone new" : "حد جديد");
    // No gendered verb about the other person in Arabic.
    const text = lang === "en" ? `${who} joined ${circle.name} 🎉` : `${circle.name}: عضو جديد معاكم، ${who} 🎉`;
    await postUpdate(prisma, m.userId, `joined:${circleId}:${joiner.id}`, text, now);
    notices.push({ userId: m.userId, text });
  }
  return notices;
}
