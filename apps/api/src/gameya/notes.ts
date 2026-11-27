import { daysToPayDay, isPaid, monthOfRound, myMember, phaseOf, roundState, type Gameya } from "@fakkarni/shared";
import type { PrismaClient, User } from "../generated/prisma/client";
import { isAwake, toLocalIso } from "../lib/time";
import type { Lang } from "../daftar/rules";
import { dueLine, ownerDayLine } from "./rules";
import { toWireGameya, visibleGameyas, withBook } from "./store";

/**
 * The gam'eya's own reminders, from the proactive tick. Template words, no AI call. They are
 * part of a book the user is in, like a reminder they asked for, so they do not count against
 * Zaki's daily budget; each is sent once (the client_id), only while the user is awake.
 *
 * - The day before pay day, from DUE_FROM_HOUR: each Zaki member who hasn't paid this round.
 * - Pay day, from OWNER_FROM_HOUR: the organizer, where the round stands (unless all paid,
 *   which they already heard when the last payment came in).
 */
export const DUE_FROM_HOUR = 10;
export const OWNER_FROM_HOUR = 18;
/** No gam'eya line this late, even if the user is still awake. */
export const UNTIL_HOUR = 22;

export interface GameyaNote {
  clientId: string;
  text: string;
}

/** Pure: which lines are due for this user at this local time. */
export function gameyaNotesDue(books: Gameya[], userId: string, localIso: string, lang: Lang): GameyaNote[] {
  const hour = Number(localIso.slice(11, 13));
  if (hour < DUE_FROM_HOUR || hour >= UNTIL_HOUR) return [];
  const today = localIso.slice(0, 10);
  const out: GameyaNote[] = [];
  for (const g of books) {
    if (phaseOf(g) !== "running") continue;
    const round = g.round;
    const month = monthOfRound(g.start_month, round);
    const days = daysToPayDay(g, round, today);
    const me = myMember(g);
    if (me && days === 1 && !isPaid(g, me.id, round)) {
      const receiver = roundState(g, round).receiver;
      out.push({ clientId: `gameya:${g.id}:${round}:due:${userId}`, text: dueLine(lang, g, month, receiver?.name ?? null, receiver?.id === me.id) });
    }
    if (g.mine && days === 0 && hour >= OWNER_FROM_HOUR && !roundState(g, round).allPaid) {
      out.push({ clientId: `gameya:${g.id}:${round}:ownerday`, text: ownerDayLine(lang, g, round, month) });
    }
  }
  return out;
}

/** Stores the due lines (once each) and returns the new ones, for a push. */
export async function sendGameyaNotes(prisma: PrismaClient, user: User, now: Date): Promise<string[]> {
  const local = toLocalIso(now, user.timezone);
  const hour = Number(local.slice(11, 13));
  if (hour < DUE_FROM_HOUR || hour >= UNTIL_HOUR || !isAwake(now, user.timezone, user.wakeTime, user.sleepTime)) return [];
  const rows = await prisma.gameya.findMany({ where: visibleGameyas(user.id), include: withBook, take: 40 });
  if (!rows.length) return [];
  const lang: Lang = user.language === "en" ? "en" : "ar";
  const notes = gameyaNotesDue(rows.map((r) => toWireGameya(r, "", user.id, now)), user.id, local, lang);
  const sent: string[] = [];
  for (const [n, note] of notes.entries()) {
    const made = await prisma.message.createMany({
      data: [{ userId: user.id, role: "friend", kind: "update", text: note.text, clientId: note.clientId, createdAt: new Date(now.getTime() + n) }],
      skipDuplicates: true,
    });
    if (made.count) sent.push(note.text);
  }
  return sent;
}
