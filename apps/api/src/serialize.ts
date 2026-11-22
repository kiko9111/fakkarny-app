import { hasPro } from "./billing/plan";
import type {
  Item as WireItem,
  Memory as WireMemory,
  Message as WireMessage,
  User as WireUser,
} from "@fakkarni/shared";
import type { Item, Memory, Message, User } from "./generated/prisma/client";

/** DB rows (camelCase, Date) → wire shapes (snake_case, ISO strings). */

const iso = (d: Date) => d.toISOString();
const isoOrNull = (d: Date | null) => (d ? d.toISOString() : null);

export function toWireMessage(m: Message): WireMessage {
  return {
    id: m.id,
    user_id: m.userId,
    role: m.role,
    text: m.text,
    client_id: m.clientId,
    kind: m.kind,
    created_at: iso(m.createdAt),
  };
}

export function toWireItem(i: Item): WireItem {
  return {
    id: i.id,
    user_id: i.userId,
    type: i.type,
    title: i.title,
    due_at: isoOrNull(i.dueAt),
    remind_at: isoOrNull(i.remindAt),
    important: i.important,
    nudge: i.nudge,
    status: i.status,
    debt_person: i.debtPerson,
    debt_amount: i.debtAmount === null ? null : Number(i.debtAmount),
    debt_direction: i.debtDirection,
    follow_up_at: isoOrNull(i.followUpAt),
    repeat_every_minutes: i.repeatEveryMinutes,
    source_message_id: i.sourceMessageId,
    updated_at: iso(i.updatedAt),
    created_at: iso(i.createdAt),
    done_at: isoOrNull(i.doneAt),
  };
}

export function toWireMemory(m: Memory): WireMemory {
  return {
    id: m.id,
    user_id: m.userId,
    kind: m.kind,
    subject: m.subject,
    content: m.content,
    last_used_at: isoOrNull(m.lastUsedAt),
    created_at: iso(m.createdAt),
  };
}

export function toWireUser(u: User): WireUser {
  return {
    id: u.id,
    name: u.name,
    language: u.language === "ar_EG" ? "ar-EG" : "en",
    timezone: u.timezone,
    wake_time: u.wakeTime,
    sleep_time: u.sleepTime,
    tone: u.tone,
    checkin_interval_h: u.checkinIntervalH === "h2" ? "2" : u.checkinIntervalH === "h4" ? "4" : "off",
    ignored_checkins: u.ignoredCheckins,
    plan: u.plan,
    plan_expires_at: isoOrNull(u.planExpiresAt),
    plan_tier: u.planTier,
    bonus_pro_until: isoOrNull(u.bonusProUntil),
    pro: hasPro(u, new Date()),
    always_direct: u.alwaysDirect,
    created_at: iso(u.createdAt),
    last_active_at: isoOrNull(u.lastActiveAt),
  };
}
