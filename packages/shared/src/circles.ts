import { z } from "zod";

/** Circles (Zaki M3): groups in the Friends and Family spaces. Wire shapes, snake_case. */
const Instant = z.iso.datetime({ offset: true });

export const CircleKind = z.enum(["friends", "family"]);
export type CircleKind = z.infer<typeof CircleKind>;
export const CircleRole = z.enum(["owner", "member"]);
export type CircleRole = z.infer<typeof CircleRole>;

export const Circle = z.object({
  id: z.string(),
  kind: CircleKind,
  name: z.string(),
  /** The caller's role in this circle. */
  role: CircleRole,
  member_count: z.number().int().nonnegative(),
  created_at: Instant,
});
export type Circle = z.infer<typeof Circle>;

export const CircleMember = z.object({
  user_id: z.string(),
  name: z.string().nullable(),
  role: CircleRole,
  joined_at: Instant,
  is_me: z.boolean(),
});
export type CircleMember = z.infer<typeof CircleMember>;

export const CircleInvite = z.object({
  code: z.string(),
  url: z.string(),
  /** People who joined through this link so far. */
  joins: z.number().int().nonnegative(),
  created_at: Instant,
  expires_at: Instant,
});
export type CircleInvite = z.infer<typeof CircleInvite>;

export const CircleDetail = Circle.extend({
  members: z.array(CircleMember),
  /** The caller's own invite links that still work. */
  open_invites: z.array(CircleInvite),
});
export type CircleDetail = z.infer<typeof CircleDetail>;

export const ListCirclesResponse = z.object({ circles: z.array(Circle) });
export type ListCirclesResponse = z.infer<typeof ListCirclesResponse>;
export const CircleResponse = z.object({ circle: CircleDetail });
export type CircleResponse = z.infer<typeof CircleResponse>;

export const CreateCircleRequest = z.object({ kind: CircleKind, name: z.string().trim().min(1).max(40) });
export type CreateCircleRequest = z.infer<typeof CreateCircleRequest>;
export const PatchCircleRequest = z.object({ name: z.string().trim().min(1).max(40) });
export type PatchCircleRequest = z.infer<typeof PatchCircleRequest>;

/** POST /circles/:id/invites → a link to send over WhatsApp from the user's own number. */
export const CreateInviteResponse = z.object({ invite: CircleInvite, share_text: z.string() });
export type CreateInviteResponse = z.infer<typeof CreateInviteResponse>;

/** GET /invites/:code — what the app shows before joining. */
export const InvitePreview = z.object({
  code: z.string(),
  circle_name: z.string(),
  circle_kind: CircleKind,
  inviter_name: z.string().nullable(),
  member_count: z.number().int().nonnegative(),
  /** "open" can be joined; the others explain why not. */
  state: z.enum(["open", "expired", "full", "already_member"]),
});
export type InvitePreview = z.infer<typeof InvitePreview>;

export const AcceptInviteResponse = z.object({ circle: CircleDetail });
export type AcceptInviteResponse = z.infer<typeof AcceptInviteResponse>;

/** Codes are typed from a WhatsApp message: upper-case, spaces and dashes ignored. */
export const normalizeInviteCode = (raw: string) => raw.replace(/[\s-]/g, "").toUpperCase();

/** Pull the code out of an invite link (https://…/i/CODE or fakkarni://invite/CODE) or a bare code. */
export function inviteCodeFromText(text: string): string | null {
  const link = /\/(?:i|invite)\/([A-Za-z0-9]{6,12})(?:[/?#\s]|$)/.exec(text);
  const code = normalizeInviteCode(link ? link[1]! : text.trim());
  return /^[A-Z0-9]{6,12}$/.test(code) ? code : null;
}
