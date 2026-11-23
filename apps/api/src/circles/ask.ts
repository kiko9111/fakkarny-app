import { circleExtras } from "@fakkarni/shared";
import type { CirclePost, PrismaClient, User } from "../generated/prisma/client";
import { hasProAccess } from "../billing/family";
import { postUpdate } from "../daftar/store";
import type { Notice } from "../proactive/notify";
import { CHECKIN_ASK_GAP_HOURS, checkinAskLine } from "../tasks/rules";
import { langOf } from "../tasks/store";
import { weekData } from "./summary";
import { circleReminderLine, parseZakiAsk, REMIND_ALL_GAP_HOURS } from "./zaki";

export type AskCircle = { id: string; name: string; createdAt: Date; members: { userId: string }[] };

/** Act on an @Zaki ask: returns Zaki's template key (with data) and who to tell. */
export async function zakiAnswer(prisma: PrismaClient, circle: AskCircle, user: User, text: string, at: Date, requireSubscription: boolean): Promise<{ event: string; notices: Notice[] }> {
  const ask = parseZakiAsk(text);
  const others = circle.members.map((m) => m.userId).filter((id) => id !== user.id);
  if (ask.kind === "remind") {
    const bucket = Math.floor(at.getTime() / (REMIND_ALL_GAP_HOURS * 3600_000));
    const clientId = `circle_remind:${circle.id}:${user.id}:${bucket}`;
    const people = await prisma.user.findMany({ where: { id: { in: others } }, select: { id: true, language: true } });
    if (people[0] && (await prisma.message.findUnique({ where: { userId_clientId: { userId: people[0].id, clientId } } }))) return { event: "zaki:too_soon", notices: [] };
    const notices: Notice[] = [];
    for (const p of people) {
      const line = circleReminderLine(langOf(p), user.name, circle.name, ask.what);
      await postUpdate(prisma, p.id, clientId, line, at);
      notices.push({ userId: p.id, text: line });
    }
    return { event: `zaki:reminded|${people.length}`, notices };
  }
  if (ask.kind === "checkin") {
    const bucket = Math.floor(at.getTime() / (CHECKIN_ASK_GAP_HOURS * 3600_000));
    const clientId = `checkin_ask:${circle.id}:${user.id}:${bucket}`;
    const people = await prisma.user.findMany({ where: { id: { in: others } }, select: { id: true, language: true } });
    const notices: Notice[] = [];
    for (const p of people) {
      const line = checkinAskLine(langOf(p), user.name, circle.name);
      const before = await prisma.message.count({ where: { userId: p.id, clientId } });
      await postUpdate(prisma, p.id, clientId, line, at);
      if (!before) notices.push({ userId: p.id, text: line });
    }
    return { event: notices.length ? `zaki:checkin|${notices.length}` : "zaki:too_soon", notices };
  }
  if (ask.kind === "summary") {
    const pro = !requireSubscription || (await hasProAccess(prisma, user, at));
    if (!circleExtras(circle.createdAt, pro, at)) return { event: "zaki:locked", notices: [] };
    const { done, open, checkins } = await weekData(prisma, circle.id, at);
    return { event: `zaki:summary|${JSON.stringify({ done, open, checkins })}`, notices: [] };
  }
  return { event: "zaki:help", notices: [] };
}

/**
 * Ask Zaki for something in front of the circle ("Zaki, remind everyone about Friday lunch"):
 * a feed post with the ask, Zaki's answer as a comment, and whom to push. Used by the feed
 * route and by the chat (chat/actions.ts).
 */
export async function askZaki(prisma: PrismaClient, circle: AskCircle, user: User, raw: string, at: Date, requireSubscription: boolean): Promise<{ post: CirclePost; event: string; notices: Notice[] }> {
  const text = raw.replace(/^\s*(?:@\s*)?(?:زكي|زكى|zaki)\s*[،,:!.\-]?\s*/i, "").trim() || raw;
  const post = await prisma.circlePost.create({ data: { circleId: circle.id, event: "zaki_ask", actorId: user.id, title: text, createdAt: at } });
  const answer = await zakiAnswer(prisma, circle, user, `زكي ${text}`, at, requireSubscription);
  await prisma.postComment.create({ data: { postId: post.id, zakiEvent: answer.event, createdAt: new Date(at.getTime() + 1) } });
  await prisma.event.create({ data: { userId: user.id, name: "feed_zaki_ask", propsJson: { kind: answer.event.split("|")[0]!.slice(5) } } });
  return { post, event: answer.event, notices: answer.notices };
}
