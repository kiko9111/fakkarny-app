import { FREE_TRACKERS, isRamadanSeason, RAMADAN_PACK, TRACKER_TEMPLATES, TrackerKind, type Tracker as WireTracker } from "@fakkarni/shared";
import { hasProAccess } from "../billing/family";
import { Prisma, type PrismaClient, type Tracker, type User } from "../generated/prisma/client";
import type { ReplyLang } from "../pipeline/rules";
import { matchTrackCommand, matchTrackerLog, titleMatchesKind } from "./match";
import { TRACKER_LABEL, trackerLabel } from "./labels";
import { trackerStats } from "./stats";

const STREAK_DAYS = 370;
const kindOf = (t: Pick<Tracker, "kind">): TrackerKind => TrackerKind.catch("custom").parse(t.kind);

/** A tracker with its numbers, in the user's local days. */
export async function toWireTracker(prisma: PrismaClient, t: Tracker & { circle?: { name: string } | null }, tz: string, now: Date): Promise<WireTracker> {
  const kind = kindOf(t);
  const tpl = TRACKER_TEMPLATES[kind];
  const goal = t.goal === null ? null : Number(t.goal);
  const [recent, all] = await Promise.all([
    prisma.trackerEntry.findMany({ where: { trackerId: t.id, at: { gte: new Date(now.getTime() - STREAK_DAYS * 86_400_000) } }, select: { amount: true, at: true } }),
    prisma.trackerEntry.aggregate({ where: { trackerId: t.id }, _sum: { amount: true } }),
  ]);
  const stats = trackerStats(recent.map((e) => ({ amount: Number(e.amount), at: e.at })), tz, now, { goal: tpl.cumulative ? null : goal, streaks: tpl.unit === "count" });
  return { id: t.id, kind, name: t.name, unit: tpl.unit, goal, cumulative: tpl.cumulative, ...stats, total: Number(all._sum.amount ?? 0), pack: t.pack === "ramadan" ? "ramadan" : null,
    ask_times: t.askTimes,
    unit_label: t.unitLabel,
    circle_id: t.circleId,
    circle_name: t.circle?.name ?? null,
    created_at: t.createdAt.toISOString(),
  };
}

/** Trackers this user may keep: 1 on the free plan, no limit with Pro (own, earned or Family). */
export const trackerLimit = async (prisma: PrismaClient, user: User, now: Date): Promise<number | null> => ((await hasProAccess(prisma, user, now)) ? null : FREE_TRACKERS);

export async function createTracker(
  prisma: PrismaClient,
  user: User,
  input: { kind: TrackerKind; name?: string; goal?: number; ask_times?: string[]; unit_label?: string; circle_id?: string | null },
  now: Date,
): Promise<Tracker | "limit" | "bad_circle"> {
  const limit = await trackerLimit(prisma, user, now);
  // Pack trackers (Ramadan) are a gift: they never use the free slot.
  if (limit !== null && (await prisma.tracker.count({ where: { userId: user.id, pack: null } })) >= limit) return "limit";
  if (input.circle_id && !(await canShareIn(prisma, user.id, input.circle_id, input.kind))) return "bad_circle";
  const goal = input.goal ?? TRACKER_TEMPLATES[input.kind].goal;
  return prisma.tracker.create({
    data: {
      userId: user.id,
      kind: input.kind,
      name: input.kind === "custom" ? input.name ?? null : null,
      goal: goal === null ? null : new Prisma.Decimal(goal),
      askTimes: [...new Set(input.ask_times ?? [])].sort(),
      unitLabel: input.kind === "custom" ? input.unit_label ?? null : null,
      circleId: input.circle_id ?? null,
      createdAt: now,
    },
  });
}

/** A tracker can be shared with a circle the owner is in, and never when it counts money. */
export async function canShareIn(prisma: PrismaClient, userId: string, circleId: string, kind: TrackerKind): Promise<boolean> {
  if (TRACKER_TEMPLATES[kind].unit === "money") return false;
  return (await prisma.circleMember.count({ where: { circleId, userId } })) === 1;
}

/** Add the Ramadan trackers the user does not follow yet. Free for everyone, in season only. */
export async function addRamadanPack(prisma: PrismaClient, user: User, now: Date): Promise<Tracker[] | "off"> {
  if (!isRamadanSeason(now)) return "off";
  const have = new Set((await prisma.tracker.findMany({ where: { userId: user.id }, select: { kind: true } })).map((t) => t.kind));
  const made: Tracker[] = [];
  for (const [n, kind] of RAMADAN_PACK.entries()) {
    if (have.has(kind)) continue;
    const goal = TRACKER_TEMPLATES[kind].goal;
    made.push(await prisma.tracker.create({ data: { userId: user.id, kind, goal: goal === null ? null : new Prisma.Decimal(goal), pack: "ramadan", createdAt: new Date(now.getTime() + n) } }));
  }
  return made;
}

/** Log one entry. On a tracker shared with a circle, reaching today's goal is posted there. */
export async function logEntry(prisma: PrismaClient, tracker: Tracker, amount: number, source: "tap" | "chat", now: Date, tz: string) {
  const entry = await prisma.trackerEntry.create({ data: { trackerId: tracker.id, amount: new Prisma.Decimal(amount), source, at: now } });
  await postGoalIfMet(prisma, tracker, tz, amount, now);
  return entry;
}

/** "Omar hit today's goal for «reading» 🎯 (5 days in a row)": once a day, the moment it is reached. */
async function postGoalIfMet(prisma: PrismaClient, tracker: Tracker, tz: string, amount: number, now: Date) {
  const kind = kindOf(tracker);
  const tpl = TRACKER_TEMPLATES[kind];
  if (!tracker.circleId || tracker.goal === null || tpl.unit === "money" || tpl.cumulative) return;
  const goal = Number(tracker.goal);
  const w = await toWireTracker(prisma, tracker, tz, now);
  if (w.today < goal || w.today - amount >= goal) return;
  await prisma.circlePost.create({ data: { circleId: tracker.circleId, event: "tracker_goal", actorId: tracker.userId, title: `${kind}|${tracker.name ?? ""}|${w.streak}`, createdAt: now } });
}

const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** Zaki's answer after logging, with the number that matters. Templates only. */
export function loggedLine(lang: ReplyLang, w: Pick<WireTracker, "kind" | "unit" | "goal" | "cumulative" | "today" | "total" | "streak"> & { name?: string | null }, amount: number): string {
  const label = trackerLabel(w.kind, w.name, lang);
  const ar = lang === "arabic";
  if (w.unit === "money") {
    if (w.cumulative) {
      const of = w.goal ? (ar ? ` من ${num(w.goal)}` : ` of ${num(w.goal)}`) : "";
      return ar ? `سجّلت ${num(amount)} جنيه في ${label} المجموع لحد دلوقتي ${num(w.total)}${of}. كل جنيه بيفرق 🌟` : `Logged EGP ${num(amount)} to ${label} Total so far: ${num(w.total)}${of}. Every pound counts 🌟`;
    }
    return ar ? `سجّلت ${num(amount)} جنيه في ${label} مصاريف النهارده: ${num(w.today)} جنيه.` : `Logged EGP ${num(amount)} to ${label} Today's spending: EGP ${num(w.today)}.`;
  }
  const streak = w.streak >= 2 ? (ar ? ` ${w.streak} يوم ورا بعض 🔥` : ` ${w.streak} days in a row 🔥`) : "";
  if (w.goal && w.today >= w.goal) return ar ? `برافو! قفلت هدف النهارده في ${label} (${num(w.today)} من ${num(w.goal)}) 🎉${streak}` : `Yes! Today's goal is done for ${label} (${num(w.today)} of ${num(w.goal)}) 🎉${streak}`;
  const progress = w.goal ? (ar ? `${num(w.today)} من ${num(w.goal)} النهارده` : `${num(w.today)} of ${num(w.goal)} today`) : ar ? `${num(w.today)} النهارده` : `${num(w.today)} today`;
  return ar ? `اتسجلت في ${label} ${progress}. كمّل كده 🌟` : `Logged for ${label} ${progress}. Keep going 🌟`;
}

export interface TrackerReply {
  text: string;
  upsell: boolean;
  /** Logged, but the message also answers an open reminder: let the model reply and close it. */
  closesReminder?: boolean;
}

/**
 * The chat side of trackers: "شربت مية" logs to a tracker the user has, "تابع معايا المية"
 * starts one. Returns null when the message is not about trackers (it then goes on as usual).
 */
export async function trackerFastPath(prisma: PrismaClient, user: User, text: string, lang: ReplyLang, now: Date): Promise<TrackerReply | null> {
  const ar = lang === "arabic";
  const wanted = matchTrackCommand(text);
  if (wanted) {
    const label = TRACKER_LABEL[wanted][lang];
    if (await prisma.tracker.findFirst({ where: { userId: user.id, kind: wanted } })) return { text: ar ? `أنا متابع معاك ${label} أصلاً 😄 قولّي كل ما تعمل وأنا أسجّل.` : `I'm already following ${label} with you 😄 Just tell me each time and I'll log it.`, upsell: false };
    const made = await createTracker(prisma, user, { kind: wanted }, now);
    if (made === "limit" || made === "bad_circle") return { text: ar ? `نفسي أتابع معاك ${label} كمان! الخطة المجانية فيها متابعة واحدة، وزكي برو بيفتحهم كلهم 🌟` : `I'd love to follow ${label} with you too! The free plan has one tracker, and Zaki Pro opens them all 🌟`, upsell: true };
    await prisma.event.create({ data: { userId: user.id, name: "tracker_created", propsJson: { kind: wanted, via: "chat" } } });
    return { text: ar ? `تمام! بدأت أتابع معاك ${label} قولّي كل ما تعمل، أو دوس عليها في صفحة المتابعة 🌟` : `Done! I'm now following ${label} with you. Tell me each time, or tap it on the Trackers page 🌟`, upsell: false };
  }
  // Only kinds the user follows, so a kind they don't track can't hide one they do.
  const followed = [...new Set((await prisma.tracker.findMany({ where: { userId: user.id }, select: { kind: true } })).map((t) => t.kind as TrackerKind))];
  const hit = matchTrackerLog(text, followed);
  if (!hit) return null; // Not something they follow: let Zaki answer normally.
  const tracker = await prisma.tracker.findFirst({ where: { userId: user.id, kind: hit.kind }, orderBy: { createdAt: "asc" } });
  if (!tracker) return null;
  await logEntry(prisma, tracker, hit.amount, "chat", now, user.timezone);
  await prisma.event.create({ data: { userId: user.id, name: "tracker_logged", propsJson: { kind: hit.kind, via: "chat" } } });
  // "خدت الدوا" may also answer an open reminder about it: logged here, then Zaki (the model)
  // still sees the message so it can close that reminder.
  const open = await prisma.item.findMany({ where: { userId: user.id, status: "open" }, select: { title: true }, take: 200 });
  if (open.some((i) => titleMatchesKind(i.title, hit.kind))) return { text: "", upsell: false, closesReminder: true };
  return { text: loggedLine(lang, await toWireTracker(prisma, tracker, user.timezone, now), hit.amount), upsell: false };
}
