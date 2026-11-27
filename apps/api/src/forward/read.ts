import { randomUUID } from "node:crypto";
import { MAX_BATCH, parseHomeworkMessage, type HomeworkDraft } from "@fakkarni/shared";
import type { Item, PrismaClient, User } from "../generated/prisma/client";
import { localToUtc, toLocalIso } from "../lib/time";
import { LABEL, type StoredCard } from "../chat/cards";
import type { ReplyLang } from "../pipeline/rules";

/**
 * A message the user forwarded to Zaki from WhatsApp (shared from the app, or pasted): someone
 * else's words. The friend model reads it like any message, told that it is forwarded (the note
 * below), so what the user may want to keep (a date, a bill, things to buy, a meeting) is saved
 * the usual way: the user's own things at once with an Undo, anything that reaches other people as
 * a card that waits for a yes. A school's homework list is spotted by code (parseHomeworkMessage)
 * and offered as one card per child: "Send these 5 homework items to Omar?".
 */

/** Roles that are never "the child" a homework list goes to. */
const GROWN_UPS = new Set(["parent", "spouse", "adult", "elder"]);
/** At most this many "send to …" cards (one per child). */
const MAX_CHILDREN = 3;

export interface HomeworkOffer {
  drafts: HomeworkDraft[];
  children: { circleId: string; circleName: string; userId: string; name: string }[];
}

/** The forwarded words look like the school's homework list: lines with subjects ("عربي: صفحة 12"). */
export function homeworkDrafts(body: string, today: string): HomeworkDraft[] {
  const drafts = parseHomeworkMessage(body.replace(/^\(sent [^)\n]*\)\n/, ""), today).filter((d) => d.subject);
  const says = /واجب|الواجبات|homework|assignment/i.test(body);
  return drafts.length >= 2 || (drafts.length >= 1 && says) ? drafts.slice(0, MAX_BATCH) : [];
}

/** A homework list, and the children in the user's family circles it could go to. Null when either is missing. */
export async function homeworkOffer(prisma: PrismaClient, user: Pick<User, "id" | "timezone">, body: string, now: Date): Promise<HomeworkOffer | null> {
  const drafts = homeworkDrafts(body, toLocalIso(now, user.timezone).slice(0, 10));
  if (!drafts.length) return null;
  const circles = await prisma.circle.findMany({
    where: { kind: "family", members: { some: { userId: user.id } } },
    select: { id: true, name: true, members: { select: { userId: true, familyRole: true, user: { select: { name: true } } }, orderBy: { joinedAt: "asc" } } },
    orderBy: { createdAt: "asc" },
    take: 10,
  });
  // A teen forwarding their own homework keeps it for themselves (the model makes their reminders).
  if (circles.some((c) => c.members.some((m) => m.userId === user.id && m.familyRole === "teen"))) return null;
  const children: HomeworkOffer["children"] = [];
  const seen = new Set<string>();
  for (const c of circles) {
    const others = c.members.filter((m) => m.userId !== user.id && !GROWN_UPS.has(m.familyRole ?? ""));
    // Members marked "teen" first; with none marked, everyone without a grown-up role.
    const teens = others.filter((m) => m.familyRole === "teen");
    for (const m of teens.length ? teens : others) {
      if (seen.has(m.userId) || !m.user.name) continue;
      seen.add(m.userId);
      children.push({ circleId: c.id, circleName: c.name, userId: m.userId, name: m.user.name });
    }
  }
  return children.length ? { drafts, children: children.slice(0, MAX_CHILDREN) } : null;
}

/** One waiting card per child: Yes sends them the whole list in one go (one chat line for the child). */
export function homeworkCards(lang: ReplyLang, offer: HomeworkOffer, tz: string): StoredCard[] {
  const items = offer.drafts.map((d) => ({ title: d.title, subject: d.subject, dueAt: d.due_day ? safeUtc(`${d.due_day}T08:00`, tz) : null }));
  return offer.children.map((c) => ({
    id: randomUUID(),
    kind: "homework_batch",
    status: "pending",
    label: LABEL.homeworkBatchAsk(lang, c.name, items.length, c.circleName),
    route: `/circle/homework?id=${c.circleId}`,
    lang,
    payload: { kind: "homework_batch", circleId: c.circleId, assigneeId: c.userId, items },
  }));
}

/** What a forwarded message saved, on one card with one Undo (each thing also shows under the message). */
export function savedCard(lang: ReplyLang, items: Pick<Item, "id" | "title">[]): StoredCard | null {
  if (!items.length) return null;
  return {
    id: randomUUID(),
    kind: "forward_saved",
    status: "done",
    label: LABEL.forwardSaved(lang, items.map((i) => i.title)),
    route: "/upcoming",
    lang,
    undo: { kind: "items_cancel", itemIds: items.map((i) => i.id) },
  };
}

/**
 * Told to the model with the context. The words are someone else's: "I" is the sender. Pull out
 * what the user would want kept; never save memories about the user from them.
 */
export function forwardNote(opts: { homework: HomeworkOffer | null }): string {
  const lines = [
    "FORWARDED: the user's last message (it starts with ↪) is a message they forwarded from WhatsApp, written by someone else (a school, a family group, a friend, a shop). It is not the user's own words: \"I\"/\"we\" in it is the sender, and \"you\" may be the user. A line \"(sent …)\" says when it was written: read \"tomorrow\" and weekdays from that day.",
    "Pull out what the user would want kept, the same way as when they ask: a reminder for each date or deadline (a meeting, an exam, a payment due, a trip, something to bring), with the reminder the evening before or an hour before as usual; things to buy go on the household list; a debt with a name stays a debt; an amount they must pay is a reminder with the amount in the title. Several things in one message: one item each (at most 6). A forwarded request for someone in their circles to do something: assign_task (it waits for the user's yes). Nothing worth keeping (a joke, news, a greeting): save nothing.",
    "Do not save memories from a forwarded message. Do not log money as spent (they have not paid it yet). Reply in one or two short lines in the user's own language (REPLY SCRIPT; not the forwarded message's language if it differs): say in a few words what the message is about and what you saved, by name. If you saved nothing, say what it says in one line and ask if they want a reminder. Never invent details that are not in the message.",
  ];
  if (opts.homework) {
    const who = opts.homework.children.map((c) => c.name).join(", ");
    lines.push(`HOMEWORK LIST: the app offers a card to send these ${opts.homework.drafts.length} homework items to ${who}. Do not create items, reminders or assign_task for the homework lines; mention the card in your reply. Other things in the message (a meeting, a payment) are saved as usual.`);
  }
  return lines.join("\n");
}

function safeUtc(local: string, tz: string): string | null {
  try {
    const d = localToUtc(local, tz);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}
