import type { FastifyBaseLogger } from "fastify";
import type { MessageKind, PrismaClient, User } from "../generated/prisma/client";
import { costUsd, FRIEND_MODEL, type FriendModel } from "../ai/model";
import { isAwake, localToUtc, toLocalIso } from "../lib/time";

const isAwakeForNotice = (user: User, now: Date) => isAwake(now, user.timezone, user.wakeTime, user.sleepTime);
import { nextOccurrences } from "@fakkarni/shared";
import { detectScript, replyLang, type ReplyLang } from "../pipeline/rules";
import { planProactive, type ProactivePlan } from "./plan";
import { monthGift } from "../money/gift";
import { GIFT_FROM_HOUR, GIFT_UNTIL_HOUR, previousMonth } from "../money/rules";
import { COOLDOWN_DAYS, planStatusCheck, statusClientId, trackerAskDue, type StatusCheck } from "./status";
import type { PushSender } from "./push";
import { writeProactive } from "./write";
import { nextTickAt } from "./schedule";
import { checkupClientId, checkupLines, hasSomething, isCheckupTime } from "./checkup";
import { isMomentTime, momentClientId, momentLines, momentPrompt, MOMENT_EVERY_DAYS, MOMENT_SYSTEM, pickMemory, QUIET_AFTER_USER_MIN } from "./memory-moment";

/**
 * Zaki's own messages (morning, night, check-ins, status checks, tracker questions, the Friday
 * check-up, the month gift, memory moments) stop at this many a local day (owner decision,
 * 2026-11-23: 4 to 5). Reminders the user asked for are not counted and always fire.
 */
export const DAILY_ZAKI_BUDGET = 5;

export async function zakiSentToday(prisma: PrismaClient, user: User, now: Date): Promise<number> {
  const local = toLocalIso(now, user.timezone);
  const midnight = localToUtc(`${local.slice(0, 10)}T00:00`, user.timezone);
  return prisma.message.count({
    where: {
      userId: user.id,
      role: "friend",
      createdAt: { gte: midnight, lte: now },
      OR: [
        { clientId: { startsWith: "status:" } },
        { clientId: { startsWith: "checkup:" } },
        { clientId: { startsWith: "gift:" } },
        { AND: [{ clientId: { startsWith: "memory:" } }, { clientId: { endsWith: ":0" } }] },
        // One proactive send can be a few bubbles: count its first one.
        { AND: [{ clientId: { startsWith: "proactive:" } }, { clientId: { endsWith: ":0" } }] },
      ],
    },
  });
}

/** Only users active recently get proactive messages (no pinging people who left). */
const ACTIVE_WITHIN_DAYS = 30;

export interface TickDeps {
  prisma: PrismaClient;
  model?: FriendModel;
  push: PushSender;
  log?: FastifyBaseLogger;
  /** Skip users whose chat is locked (FR-9). */
  requireSubscription?: boolean;
}

/** Which language to start a conversation in: follow how the user last wrote, else their setting. */
async function scriptFor(prisma: PrismaClient, user: User): Promise<ReplyLang> {
  const last = await prisma.message.findFirst({ where: { userId: user.id, role: "user" }, orderBy: { createdAt: "desc" }, select: { text: true } });
  if (last) return replyLang(detectScript(last.text));
  return user.language === "en" ? "english" : "arabic";
}

const TRIAL_NOTICE: Record<ReplyLang, string> = {
  arabic: "على فكرة، التجربة المجانية بتاعتك بتخلص بعد يومين. لو حابب نكمّل سوا، تقدر تشترك من الإعدادات — ولو لأ، ولا يهمك 🙂",
  english: "Heads up: your free trial ends in 2 days. If you'd like to keep chatting you can subscribe in settings — and if not, no worries 🙂",
};

/** F1: one honest heads-up on day 5 of the 7-day trial (no pressure, no guilt). */
async function trialNotice(deps: TickDeps, user: User, now: Date): Promise<boolean> {
  if (user.plan !== "trial" || !user.planExpiresAt) return false;
  const left = user.planExpiresAt.getTime() - now.getTime();
  if (left <= 0 || left > 48 * 3600_000) return false;
  const already = await deps.prisma.event.findFirst({ where: { userId: user.id, name: "trial_ending_notice", createdAt: { gte: new Date(now.getTime() - 7 * 86400_000) } } });
  if (already) return false;
  const script = await scriptFor(deps.prisma, user);
  await deps.prisma.message.create({
    data: { userId: user.id, role: "friend", kind: "checkin", text: TRIAL_NOTICE[script], clientId: `proactive:trial:${now.toISOString()}`, createdAt: now },
  });
  await deps.prisma.event.create({ data: { userId: user.id, name: "trial_ending_notice", propsJson: {} } });
  return true;
}

/** How far back a missed reminder is still worth posting (server was down, user was inactive). */
const REMINDER_LOOKBACK_MS = 6 * 3600_000;

const REMINDER_FALLBACK: Record<ReplyLang, (title: string) => string> = {
  arabic: (title) => `فاكر «${title}»؟ ده وقته.`,
  english: (title) => `Remember “${title}”? It's time.`,
};

/**
 * Reminders fire as local notifications on the phone (they work offline), but the
 * conversation is the product: the same nudge is also written into the chat, so the
 * user sees it there and the friend knows it reminded them. No push: the phone already
 * notified. Idempotent through the unique (user, client_id).
 */
export async function postDueReminders(prisma: PrismaClient, user: User, now: Date): Promise<number> {
  const due = await prisma.item.findMany({
    where: {
      userId: user.id,
      status: "open",
      type: { in: ["reminder", "task"] },
      remindAt: { lte: now, gte: new Date(now.getTime() - REMINDER_LOOKBACK_MS) },
    },
    orderBy: { remindAt: "asc" },
    take: 20,
  });
  if (!due.length) return 0;
  const lang = await scriptFor(prisma, user);
  let posted = 0;
  for (const [n, item] of due.entries()) {
    const { count } = await prisma.message.createMany({
      data: [
        {
          userId: user.id,
          role: "friend",
          kind: "reminder",
          text: item.nudge?.trim() || REMINDER_FALLBACK[lang](item.title),
          // One message per item and remind time: a moved or repeating reminder makes a new one.
          clientId: `reminder:${item.id}:${item.remindAt!.toISOString()}`,
          // "now", not the remind time: the phone pulls messages newer than the last one it has.
          createdAt: new Date(now.getTime() + n),
        },
      ],
      skipDuplicates: true,
    });
    posted += count;
    if (item.repeatEveryMinutes) {
      // Move a repeating reminder to its next waking-hours occurrence.
      const [next] = nextOccurrences(item.remindAt!, item.repeatEveryMinutes, now, 1, (at) => isAwake(at, user.timezone, user.wakeTime, user.sleepTime));
      if (next) await prisma.item.update({ where: { id: item.id }, data: { remindAt: next, dueAt: next } });
    }
  }
  return posted;
}

/** Plan + write + store + push for one user. Returns the plan that was sent, if any. */
export async function runForUser(deps: TickDeps, user: User, now: Date): Promise<ProactivePlan | null> {
  const { prisma } = deps;
  // Everyone gets Zaki's morning, evening and check-in messages, free users included: they
  // are template-cheap and drive the daily habit (owner decision, 2026-11-22).
  if (isAwakeForNotice(user, now) && (await trialNotice(deps, user, now))) return null;
  const tz = user.timezone;
  const startOfDayLocal = toLocalIso(now, tz).slice(0, 10);

  const [items, todays] = await Promise.all([
    prisma.item.findMany({
      where: {
        userId: user.id,
        OR: [{ status: "open" }, { status: "done", followUpAt: { not: null }, followedUpAt: null }],
      },
      take: 200,
    }),
    prisma.message.findMany({
      where: { userId: user.id, role: "friend", kind: { in: ["checkin", "followup"] }, createdAt: { gte: new Date(now.getTime() - 26 * 3600_000) } },
      select: { createdAt: true },
    }),
  ]);
  const unpromptedToday = todays.filter((m) => toLocalIso(m.createdAt, tz).startsWith(startOfDayLocal)).length;

  const plan = planProactive({
    user: { ...user, checkinIntervalH: user.checkinIntervalH },
    now,
    items: items.map((i) => ({ ...i, type: i.type, status: i.status })),
    unpromptedToday,
  });
  // A status check ("did you get to …?") takes the place of a plain check-in: it has a reason.
  if (!plan || plan.kind === "checkin") {
    const check = await statusCheckFor(prisma, user, now);
    if (check) {
      await sendStatusCheck(deps, user, check, now);
      return { kind: "followup", itemIds: [], facts: [], slowdownNotice: false };
    }
  }
  if (!plan) return null;

  const script = await scriptFor(prisma, user);
  const { messages, usage } = await writeProactive(deps.model, plan, { name: user.name, script, tone: user.tone });

  const kind: MessageKind = plan.kind;
  const stored = await prisma.$transaction(async (tx) => {
    const rows = [];
    for (const [n, text] of messages.entries()) {
      rows.push(
        await tx.message.create({
          data: { userId: user.id, role: "friend", kind, text, clientId: `proactive:${kind}:${now.toISOString()}:${n}`, createdAt: new Date(now.getTime() + n) },
        }),
      );
    }
    const userUpdate: Parameters<typeof tx.user.update>[0]["data"] = {};
    if (kind === "morning") userUpdate.lastMorningAt = now;
    if (kind === "night") userUpdate.lastNightAt = now;
    if (kind === "checkin") {
      // The previous check-in went unanswered → count it as ignored (F7 auto-slowdown).
      const ignoredPrev = user.lastCheckinAt && (!user.lastUserMessageAt || user.lastUserMessageAt < user.lastCheckinAt);
      userUpdate.lastCheckinAt = now;
      if (ignoredPrev) userUpdate.ignoredCheckins = { increment: 1 };
      if (plan.slowdownNotice) userUpdate.slowdownNoticed = true;
    }
    if (Object.keys(userUpdate).length) await tx.user.update({ where: { id: user.id }, data: userUpdate });
    if (kind === "followup") await tx.item.updateMany({ where: { id: { in: plan.itemIds }, userId: user.id }, data: { followedUpAt: now } });
    if (usage) {
      await tx.event.create({ data: { userId: user.id, name: "ai_call", propsJson: { purpose: kind, model: FRIEND_MODEL, ...usage, cost_usd: costUsd(usage) } } });
    }
    return rows;
  });

  // A follow-up ("how was the dentist?") already shows as a local notification on the phone at
  // the same moment, like reminders: pushing it too would notify twice.
  if (kind !== "followup") await pushToUser(deps, user, stored.map((m) => m.text).join("\n"), kind);
  return plan;
}

/** Gather what a status check needs and let the pure planner pick one (or none). */
async function statusCheckFor(prisma: PrismaClient, user: User, now: Date): Promise<StatusCheck | null> {
  const since = new Date(now.getTime() - COOLDOWN_DAYS.debt * 86400_000);
  const dayStart = new Date(now.getTime() - 26 * 3600_000);
  const [items, trackers, past] = await Promise.all([
    prisma.item.findMany({ where: { userId: user.id, status: "open", type: { in: ["reminder", "task", "debt"] } }, take: 200 }),
    prisma.tracker.findMany({ where: { userId: user.id }, include: { entries: { where: { at: { gte: dayStart } }, select: { at: true } } } }),
    prisma.message.findMany({ where: { userId: user.id, role: "friend", clientId: { startsWith: "status:" }, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, select: { clientId: true, createdAt: true } }),
  ]);
  const today = toLocalIso(now, user.timezone).slice(0, 10);
  return planStatusCheck({
    now,
    timezone: user.timezone,
    wakeTime: user.wakeTime,
    sleepTime: user.sleepTime,
    lastUserMessageAt: user.lastUserMessageAt,
    items: items.map((i) => ({ ...i, debtAmount: i.debtAmount === null ? null : Number(i.debtAmount) })),
    trackers: trackers.map((t) => ({ id: t.id, kind: t.kind, loggedToday: t.entries.filter((e) => toLocalIso(e.at, user.timezone).startsWith(today)).length })),
    history: past.map((m) => ({
      subject: m.clientId!.split(":").slice(1, 3).join(":"),
      at: m.createdAt,
      answered: !!user.lastUserMessageAt && user.lastUserMessageAt > m.createdAt,
    })),
  });
}

/** Zaki's end-of-month gift: on the 1st, late morning, once, when last month had any money logged. */
export async function sendMonthGift(deps: TickDeps, user: User, now: Date): Promise<boolean> {
  const local = toLocalIso(now, user.timezone);
  const hour = Number(local.slice(11, 13));
  if (local.slice(8, 10) !== "01" || hour < GIFT_FROM_HOUR || hour >= GIFT_UNTIL_HOUR) return false;
  const month = previousMonth(local.slice(0, 7));
  const clientId = `gift:${month}`;
  if (await deps.prisma.message.findFirst({ where: { userId: user.id, clientId }, select: { id: true } })) return false;
  const gift = await monthGift(deps.prisma, user, now, month);
  if (!gift.lines.length) return false;
  const text = gift.lines.join("\n");
  await deps.prisma.message.createMany({ data: [{ userId: user.id, role: "friend", kind: "update", text, clientId, createdAt: now }], skipDuplicates: true });
  await deps.prisma.event.create({ data: { userId: user.id, name: "month_gift", propsJson: {} } });
  await pushToUser(deps, user, gift.lines[0]!, "update");
  return true;
}

/** The Friday life check-up: a short honest look at the week and one question. Template words, no AI call. */
export async function sendFridayCheckup(deps: TickDeps, user: User, now: Date): Promise<boolean> {
  const local = toLocalIso(now, user.timezone);
  if (!isCheckupTime(local) || !isAwakeForNotice(user, now)) return false;
  const clientId = checkupClientId(local.slice(0, 10));
  if (await deps.prisma.message.findFirst({ where: { userId: user.id, clientId }, select: { id: true } })) return false;
  const week = new Date(now.getTime() - 7 * 86400_000);
  const ahead = new Date(now.getTime() + 7 * 86400_000);
  const timed = { type: { in: ["reminder" as const, "task" as const] } };
  const [done, overdue, upcoming, owedToMe, iOwe, trackers] = await Promise.all([
    deps.prisma.item.count({ where: { userId: user.id, ...timed, status: "done", doneAt: { gte: week } } }),
    deps.prisma.item.count({ where: { userId: user.id, ...timed, status: "open", repeatEveryMinutes: null, dueAt: { lt: now } } }),
    deps.prisma.item.count({ where: { userId: user.id, ...timed, status: "open", dueAt: { gte: now, lt: ahead } } }),
    deps.prisma.item.count({ where: { userId: user.id, type: "debt", status: "open", debtDirection: "owed_to_me" } }),
    deps.prisma.item.count({ where: { userId: user.id, type: "debt", status: "open", debtDirection: "i_owe" } }),
    deps.prisma.tracker.findMany({ where: { userId: user.id }, select: { kind: true, name: true, entries: { where: { at: { gte: week } }, select: { at: true } } }, take: 20 }),
  ]);
  const best = trackers
    .map((t) => ({ name: t.name ?? null, kind: t.kind, days: new Set(t.entries.map((e) => toLocalIso(e.at, user.timezone).slice(0, 10))).size }))
    .sort((a, b) => b.days - a.days)[0];
  const input = { done, overdue, upcoming, owedToMe, iOwe, trackerDays: best?.name ? Math.min(best.days, 7) : 0, trackerName: best?.name ?? null };
  if (!hasSomething(input)) return false;
  const lines = checkupLines(await scriptFor(deps.prisma, user), input);
  await deps.prisma.message.createMany({ data: [{ userId: user.id, role: "friend", kind: "checkin", text: lines.join("\n"), clientId, createdAt: now }], skipDuplicates: true });
  await deps.prisma.event.create({ data: { userId: user.id, name: "friday_checkup", propsJson: {} } });
  await pushToUser(deps, user, lines[0]!, "checkin");
  return true;
}

/** About once a week, Zaki brings back something the user told him weeks ago (memory-moment.ts). */
export async function sendMemoryMoment(deps: TickDeps, user: User, now: Date): Promise<boolean> {
  if (!deps.model || !isMomentTime(toLocalIso(now, user.timezone)) || !isAwakeForNotice(user, now)) return false;
  if (user.lastUserMessageAt && now.getTime() - user.lastUserMessageAt.getTime() < QUIET_AFTER_USER_MIN * 60_000) return false;
  const since = new Date(now.getTime() - MOMENT_EVERY_DAYS * 86400_000);
  // Tried this week already (sent, or the model passed): wait for next week.
  if (await deps.prisma.event.findFirst({ where: { userId: user.id, name: "memory_moment", createdAt: { gte: since } }, select: { id: true } })) return false;
  const memory = pickMemory(await deps.prisma.memory.findMany({ where: { userId: user.id }, take: 300 }), now);
  if (!memory) return false;
  const script = await scriptFor(deps.prisma, user);
  let lines: string[] | null = null;
  let usage: Awaited<ReturnType<FriendModel["complete"]>>["usage"] | null = null;
  try {
    const out = await deps.model.complete({ system: MOMENT_SYSTEM, prompt: momentPrompt(memory, now, { name: user.name, script }), maxTokens: 300 });
    usage = out.usage;
    lines = momentLines(out.text);
  } catch {
    return false;
  }
  await deps.prisma.$transaction(async (tx) => {
    await tx.memory.update({ where: { id: memory.id }, data: { lastUsedAt: now } });
    await tx.event.create({ data: { userId: user.id, name: "memory_moment", propsJson: { sent: Boolean(lines) } } });
    if (usage) await tx.event.create({ data: { userId: user.id, name: "ai_call", propsJson: { purpose: "memory_moment", model: FRIEND_MODEL, ...usage, cost_usd: costUsd(usage) } } });
    if (lines) {
      await tx.message.createMany({
        data: lines.map((text, n) => ({ userId: user.id, role: "friend" as const, kind: "checkin" as const, text, clientId: `${momentClientId(memory.id, now)}:${n}`, createdAt: new Date(now.getTime() + n) })),
        skipDuplicates: true,
      });
    }
  });
  if (!lines) return false;
  await pushToUser(deps, user, lines.join("\n"), "checkin");
  return true;
}

/** Tracker questions at the times the user picked in the builder. Template words, no AI call. */
export async function askTrackers(deps: TickDeps, user: User, now: Date): Promise<boolean> {
  const trackers = await deps.prisma.tracker.findMany({
    where: { userId: user.id, NOT: { askTimes: { isEmpty: true } } },
    include: { entries: { where: { at: { gte: new Date(now.getTime() - 26 * 3600_000) } }, select: { at: true, amount: true } } },
  });
  if (!trackers.length) return false;
  const today = toLocalIso(now, user.timezone).slice(0, 10);
  const past = await deps.prisma.message.findMany({
    where: { userId: user.id, role: "friend", clientId: { startsWith: "status:tracker:" }, createdAt: { gte: new Date(now.getTime() - 26 * 3600_000) } },
    select: { clientId: true, createdAt: true },
  });
  const check = trackerAskDue(
    trackers.map((t) => ({
      id: t.id,
      kind: t.kind,
      name: t.name,
      askTimes: t.askTimes,
      goal: t.goal === null ? null : Number(t.goal),
      today: t.entries.filter((e) => toLocalIso(e.at, user.timezone).startsWith(today)).reduce((n, e) => n + Number(e.amount), 0),
    })),
    now,
    user.timezone,
    user.wakeTime,
    user.sleepTime,
    past.map((m) => ({ subject: m.clientId!.split(":").slice(1, 3).join(":"), at: m.createdAt })),
  );
  if (!check) return false;
  await sendStatusCheck(deps, user, check, now);
  return true;
}

/** Template words, no AI call. Kind "followup" so builds that predate status checks show it. */
async function sendStatusCheck(deps: TickDeps, user: User, check: StatusCheck, now: Date) {
  const script = await scriptFor(deps.prisma, user);
  const text = check.text[script];
  await deps.prisma.message.create({ data: { userId: user.id, role: "friend", kind: "followup", text, clientId: statusClientId(check.subject, now), createdAt: now } });
  await deps.prisma.event.create({ data: { userId: user.id, name: "status_check", propsJson: { subject: check.subject.split(":")[0]! } } });
  await pushToUser(deps, user, text, "followup");
}

/** Free push; the message is already in the chat for the next sync (GET /messages). */
async function pushToUser(deps: TickDeps, user: User, body: string, kind: MessageKind) {
  const { prisma } = deps;
  const devices = await prisma.device.findMany({ where: { userId: user.id, pushToken: { not: null } } });
  if (devices.length) {
    try {
      const result = await deps.push(
        devices.map((d) => ({
          to: d.pushToken!,
          title: "Zaki",
          body,
          sound: "default" as const,
          data: { type: "message", kind },
        })),
      );
      if (result.invalidTokens.length) {
        await prisma.device.updateMany({ where: { pushToken: { in: result.invalidTokens } }, data: { pushToken: null } });
      }
    } catch (err) {
      deps.log?.warn({ err: (err as Error).name }, "push failed");
    }
  }
}

/**
 * Everything the tick does for one user at `now`: post due reminders, then at most one of
 * Zaki's own messages. Returns whether one was sent and whether today's budget is used up.
 */
export async function tickUser(deps: TickDeps, user: User, now: Date): Promise<{ sent: boolean; budgetSpent: boolean }> {
  await postDueReminders(deps.prisma, user, now);
  if ((await zakiSentToday(deps.prisma, user, now)) >= DAILY_ZAKI_BUDGET) return { sent: false, budgetSpent: true };
  const sent =
    (await sendMonthGift(deps, user, now)) ||
    (await sendFridayCheckup(deps, user, now)) ||
    (await sendMemoryMoment(deps, user, now)) ||
    (await askTrackers(deps, user, now)) ||
    Boolean(await runForUser(deps, user, now));
  return { sent, budgetSpent: false };
}

/** Users claimed per query, how many are worked on at once, and when a tick stops claiming. */
export const TICK_BATCH = 200;
export const TICK_CONCURRENCY = 5;
export const TICK_BUDGET_MS = 45_000;
/** A claimed user is not claimed again for this long; a failed user is retried after it. */
const LEASE_MS = 3 * 60_000;
/** Items whose remind_at / follow_up_at passed this recently pull their user in right away. */
export const DUE_ITEM_WINDOW_MIN = 2;

/**
 * Claim users who are due, in one statement: their next_tick_at has passed (or was never set),
 * or one of their open items just reached its reminder or follow-up time. Claiming moves
 * next_tick_at forward by the lease, and SKIP LOCKED keeps two API instances apart.
 */
async function claimDue(prisma: PrismaClient, now: Date, lease: Date, skip: string[]): Promise<string[]> {
  const activeSince = new Date(now.getTime() - ACTIVE_WITHIN_DAYS * 86400_000);
  const itemSince = new Date(now.getTime() - DUE_ITEM_WINDOW_MIN * 60_000);
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "users" SET "next_tick_at" = ${lease}
    WHERE "id" IN (
      SELECT u."id" FROM "users" u
      WHERE u."last_active_at" >= ${activeSince}
        AND NOT (u."id"::text = ANY(${skip}::text[]))
        AND (
          u."next_tick_at" IS NULL OR u."next_tick_at" <= ${now}
          OR u."id" IN (
            SELECT i."user_id" FROM "items" i
            WHERE i."status" = 'open'
              AND ((i."remind_at" > ${itemSince} AND i."remind_at" <= ${now})
                OR (i."follow_up_at" > ${itemSince} AND i."follow_up_at" <= ${now}))
          )
        )
      ORDER BY u."next_tick_at" ASC NULLS FIRST
      LIMIT ${TICK_BATCH}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id"`;
  return rows.map((r) => r.id);
}

async function forEachLimit<T>(list: T[], limit: number, fn: (x: T) => Promise<void>): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (next < list.length) await fn(list[next++]!);
  });
  await Promise.all(lanes);
}

/**
 * Runs every minute (pg-boss cron, one at a time): looks only at users who are due
 * (schedule.ts), a batch at a time with a few in parallel, and stops claiming after
 * TICK_BUDGET_MS so it never runs into the next minute; whoever is left is first next time.
 */
export async function runTick(deps: TickDeps, now = new Date(), clock: () => number = Date.now): Promise<number> {
  const started = clock();
  const lease = new Date(now.getTime() + LEASE_MS);
  const seen: string[] = [];
  let sent = 0;
  while (clock() - started < TICK_BUDGET_MS) {
    const ids = await claimDue(deps.prisma, now, lease, seen);
    if (!ids.length) break;
    seen.push(...ids);
    const users = await deps.prisma.user.findMany({ where: { id: { in: ids } } });
    await forEachLimit(users, TICK_CONCURRENCY, async (user) => {
      try {
        const result = await tickUser(deps, user, now);
        if (result.sent) sent++;
        // Only if nothing (a settings change) moved it meanwhile.
        await deps.prisma.user.updateMany({ where: { id: user.id, nextTickAt: lease }, data: { nextTickAt: nextTickAt(user, now, result) } });
      } catch (err) {
        // The lease runs out and the user is tried again in a few minutes.
        deps.log?.error({ err: (err as Error).name, userId: user.id }, "proactive message failed");
      }
    });
    if (ids.length < TICK_BATCH) break;
  }
  return sent;
}
