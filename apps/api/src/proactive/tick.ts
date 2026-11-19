import type { FastifyBaseLogger } from "fastify";
import type { MessageKind, PrismaClient, User } from "../generated/prisma/client";
import { costUsd, FRIEND_MODEL, type FriendModel } from "../ai/model";
import { isAwake, toLocalIso } from "../lib/time";

const isAwakeForNotice = (user: User, now: Date) => isAwake(now, user.timezone, user.wakeTime, user.sleepTime);
import { canChat, hasActivePlan } from "../billing/plan";
import { detectScript, type Script } from "../pipeline/rules";
import { planProactive, type ProactivePlan } from "./plan";
import type { PushSender } from "./push";
import { writeProactive } from "./write";

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
async function scriptFor(prisma: PrismaClient, user: User): Promise<Script> {
  const last = await prisma.message.findFirst({ where: { userId: user.id, role: "user" }, orderBy: { createdAt: "desc" }, select: { text: true } });
  if (last) return detectScript(last.text);
  return user.language === "en" ? "english" : "arabic";
}

const TRIAL_NOTICE: Record<Script, string> = {
  arabic: "على فكرة، التجربة المجانية بتاعتك بتخلص بعد يومين. لو حابب نكمّل سوا، تقدر تشترك من الإعدادات — ولو لأ، ولا يهمك 🙂",
  franco: "3ala fekra, el free trial bta3ak bey5las ba3d yomen. Law 7abeb nekamel sawa te2dar teshtrek men el settings — w law la2, wala yhemmak 🙂",
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

/** Plan + write + store + push for one user. Returns the plan that was sent, if any. */
export async function runForUser(deps: TickDeps, user: User, now: Date): Promise<ProactivePlan | null> {
  const { prisma } = deps;
  if (deps.requireSubscription) {
    // Locked chats get no proactive messages; the free first exchange counts as unlocked.
    const sent = hasActivePlan(user, now) ? 0 : await prisma.message.count({ where: { userId: user.id, role: "user" } });
    if (!canChat(user, sent, now).ok) return null;
  }
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

  // Free push; the message is already in the chat for the next sync (GET /messages).
  const devices = await prisma.device.findMany({ where: { userId: user.id, pushToken: { not: null } } });
  if (devices.length) {
    try {
      const result = await deps.push(
        devices.map((d) => ({
          to: d.pushToken!,
          title: "Fakkarni",
          body: stored.map((m) => m.text).join("\n"),
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
  return plan;
}

/** Runs every minute (pg-boss cron): one proactive message at most per user per tick. */
export async function runTick(deps: TickDeps, now = new Date()): Promise<number> {
  const users = await deps.prisma.user.findMany({
    where: { lastActiveAt: { gte: new Date(now.getTime() - ACTIVE_WITHIN_DAYS * 86400_000) } },
  });
  let sent = 0;
  for (const user of users) {
    try {
      if (await runForUser(deps, user, now)) sent++;
    } catch (err) {
      deps.log?.error({ err: (err as Error).name, userId: user.id }, "proactive message failed");
    }
  }
  return sent;
}
