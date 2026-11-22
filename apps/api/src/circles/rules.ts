import { randomInt } from "node:crypto";

/**
 * Circles are free and unlimited (owner decision: never cap the shared action). These are
 * abuse guards only, set far above what a real family or group of friends needs.
 */
export const MAX_CIRCLE_MEMBERS = 50;
export const MAX_CIRCLES_PER_USER = 100;
export const INVITE_VALID_DAYS = 30;

// No 0/O, 1/I/L: codes get read out loud and typed from a WhatsApp message.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newInviteCode(length = 8): string {
  let code = "";
  for (let i = 0; i < length; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

export type InviteState = "open" | "expired" | "full" | "already_member";

export function inviteState(
  invite: { expiresAt: Date; revokedAt: Date | null },
  circle: { memberCount: number; isMember: boolean },
  now: Date,
): InviteState {
  if (circle.isMember) return "already_member";
  if (invite.revokedAt || invite.expiresAt <= now) return "expired";
  if (circle.memberCount >= MAX_CIRCLE_MEMBERS) return "full";
  return "open";
}

/** The WhatsApp message the inviter sends from their own number. */
export function inviteShareText(opts: { lang: "ar" | "en"; circleName: string; kind: "friends" | "family"; url: string }): string {
  if (opts.lang === "en") {
    return `Join "${opts.circleName}" with me on Zaki 🌟 We share tasks, who owes what and reminders, and Zaki keeps track for us.\n${opts.url}`;
  }
  const what = opts.kind === "family" ? "طلبات البيت والمهام والتذكيرات" : "المهام والفلوس اللي بينا والتذكيرات";
  return `تعالى معايا في «${opts.circleName}» على زكي 🌟 هنتابع ${what} مع بعض، وزكي بيفتكر عننا.\n${opts.url}`;
}
