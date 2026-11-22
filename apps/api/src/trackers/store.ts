import { FREE_TRACKERS, TRACKER_TEMPLATES, TrackerKind, type Tracker as WireTracker } from "@fakkarni/shared";
import { hasProAccess } from "../billing/family";
import { Prisma, type PrismaClient, type Tracker, type User } from "../generated/prisma/client";
import type { ReplyLang } from "../pipeline/rules";
import { ALL_KINDS, matchTrackCommand, matchTrackerLog } from "./match";
import { trackerStats } from "./stats";

const STREAK_DAYS = 370;
const kindOf = (t: Pick<Tracker, "kind">): TrackerKind => TrackerKind.catch("custom").parse(t.kind);

/** A tracker with its numbers, in the user's local days. */
export async function toWireTracker(prisma: PrismaClient, t: Tracker, tz: string, now: Date): Promise<WireTracker> {
  const kind = kindOf(t);
  const tpl = TRACKER_TEMPLATES[kind];
  const goal = t.goal === null ? null : Number(t.goal);
  const [recent, all] = await Promise.all([
    prisma.trackerEntry.findMany({ where: { trackerId: t.id, at: { gte: new Date(now.getTime() - STREAK_DAYS * 86_400_000) } }, select: { amount: true, at: true } }),
    prisma.trackerEntry.aggregate({ where: { trackerId: t.id }, _sum: { amount: true } }),
  ]);
  const stats = trackerStats(recent.map((e) => ({ amount: Number(e.amount), at: e.at })), tz, now, { goal: tpl.cumulative ? null : goal, streaks: tpl.unit === "count" });
  return { id: t.id, kind, name: t.name, unit: tpl.unit, goal, cumulative: tpl.cumulative, ...stats, total: Number(all._sum.amount ?? 0), created_at: t.createdAt.toISOString() };
}

/** Trackers this user may keep: 1 on the free plan, no limit with Pro (own, earned or Family). */
export const trackerLimit = async (prisma: PrismaClient, user: User, now: Date): Promise<number | null> => ((await hasProAccess(prisma, user, now)) ? null : FREE_TRACKERS);

export async function createTracker(prisma: PrismaClient, user: User, input: { kind: TrackerKind; name?: string; goal?: number }, now: Date): Promise<Tracker | "limit"> {
  const limit = await trackerLimit(prisma, user, now);
  if (limit !== null && (await prisma.tracker.count({ where: { userId: user.id } })) >= limit) return "limit";
  const goal = input.goal ?? TRACKER_TEMPLATES[input.kind].goal;
  return prisma.tracker.create({
    data: { userId: user.id, kind: input.kind, name: input.kind === "custom" ? input.name ?? null : null, goal: goal === null ? null : new Prisma.Decimal(goal), createdAt: now },
  });
}

export const logEntry = (prisma: PrismaClient, trackerId: string, amount: number, source: "tap" | "chat", now: Date) =>
  prisma.trackerEntry.create({ data: { trackerId, amount: new Prisma.Decimal(amount), source, at: now } });

const LABEL: Record<TrackerKind, Record<ReplyLang, string>> = {
  water: { arabic: "المية 💧", english: "water 💧" },
  prayer: { arabic: "الصلاة 🤲", english: "prayers 🤲" },
  gym: { arabic: "التمرين 💪", english: "workouts 💪" },
  quran: { arabic: "القرآن 📖", english: "Quran 📖" },
  medicine: { arabic: "الدوا 💊", english: "medicine 💊" },
  study: { arabic: "المذاكرة 📚", english: "studying 📚" },
  spending: { arabic: "المصاريف 🧾", english: "spending 🧾" },
  savings: { arabic: "التحويش 🐷", english: "savings 🐷" },
  custom: { arabic: "", english: "" },
};
const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** Zaki's answer after logging, with the number that matters. Templates only. */
export function loggedLine(lang: ReplyLang, w: Pick<WireTracker, "kind" | "unit" | "goal" | "cumulative" | "today" | "total" | "streak">, amount: number): string {
  const label = LABEL[w.kind][lang];
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
}

/**
 * The chat side of trackers: "شربت مية" logs to a tracker the user has, "تابع معايا المية"
 * starts one. Returns null when the message is not about trackers (it then goes on as usual).
 */
export async function trackerFastPath(prisma: PrismaClient, user: User, text: string, lang: ReplyLang, now: Date): Promise<TrackerReply | null> {
  const ar = lang === "arabic";
  const wanted = matchTrackCommand(text);
  if (wanted) {
    const label = LABEL[wanted][lang];
    if (await prisma.tracker.findFirst({ where: { userId: user.id, kind: wanted } })) return { text: ar ? `أنا متابع معاك ${label} أصلاً 😄 قولّي كل ما تعمل وأنا أسجّل.` : `I'm already following ${label} with you 😄 Just tell me each time and I'll log it.`, upsell: false };
    const made = await createTracker(prisma, user, { kind: wanted }, now);
    if (made === "limit") return { text: ar ? `نفسي أتابع معاك ${label} كمان! الخطة المجانية فيها متابعة واحدة، وزكي برو بيفتحهم كلهم 🌟` : `I'd love to follow ${label} with you too! The free plan has one tracker, and Zaki Pro opens them all 🌟`, upsell: true };
    await prisma.event.create({ data: { userId: user.id, name: "tracker_created", propsJson: { kind: wanted, via: "chat" } } });
    return { text: ar ? `تمام! بدأت أتابع معاك ${label} قولّي كل ما تعمل، أو دوس عليها في صفحة المتابعة 🌟` : `Done! I'm now following ${label} with you. Tell me each time, or tap it on the Trackers page 🌟`, upsell: false };
  }
  const hit = matchTrackerLog(text, ALL_KINDS);
  if (!hit) return null;
  const tracker = await prisma.tracker.findFirst({ where: { userId: user.id, kind: hit.kind }, orderBy: { createdAt: "asc" } });
  if (!tracker) return null; // Not something they follow: let Zaki answer normally.
  await logEntry(prisma, tracker.id, hit.amount, "chat", now);
  await prisma.event.create({ data: { userId: user.id, name: "tracker_logged", propsJson: { kind: hit.kind, via: "chat" } } });
  return { text: loggedLine(lang, await toWireTracker(prisma, tracker, user.timezone, now), hit.amount), upsell: false };
}
