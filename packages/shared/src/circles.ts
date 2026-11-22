import { z } from "zod";

/** Circles (Zaki M3): groups in the Friends and Family spaces. Wire shapes, snake_case. */
const Instant = z.iso.datetime({ offset: true });

export const CircleKind = z.enum(["friends", "family"]);
export type CircleKind = z.infer<typeof CircleKind>;
export const CircleRole = z.enum(["owner", "member"]);
export type CircleRole = z.infer<typeof CircleRole>;

/** Which family this is; the app adapts its suggestions (check-in order, task ideas). */
export const FamilyType = z.enum(["parents_teens", "adults_elders", "spouses", "mixed"]);
export type FamilyType = z.infer<typeof FamilyType>;
/** A member's own place in a family circle. Optional; each person picks theirs. */
export const FamilyRole = z.enum(["parent", "teen", "adult", "elder", "spouse"]);
export type FamilyRole = z.infer<typeof FamilyRole>;

/** One-tap check-ins ("I arrived", "took my medicine"). Free and unlimited. */
export const CheckinKind = z.enum(["arrived", "home", "on_way", "medicine", "ok"]);
export type CheckinKind = z.infer<typeof CheckinKind>;

/** The check-in buttons, most useful first for this kind of family. */
export function checkinOrder(familyType: FamilyType | null | undefined): CheckinKind[] {
  if (familyType === "adults_elders") return ["medicine", "ok", "home", "arrived", "on_way"];
  if (familyType === "spouses") return ["on_way", "arrived", "home", "ok", "medicine"];
  return ["arrived", "home", "on_way", "ok", "medicine"];
}

export const Circle = z.object({
  id: z.string(),
  kind: CircleKind,
  name: z.string(),
  /** The caller's role in this circle. */
  role: CircleRole,
  member_count: z.number().int().nonnegative(),
  /** Family circles only, when the owner picked one. */
  family_type: FamilyType.nullable().default(null),
  created_at: Instant,
});
export type Circle = z.infer<typeof Circle>;

export const CircleMember = z.object({
  user_id: z.string(),
  name: z.string().nullable(),
  role: CircleRole,
  joined_at: Instant,
  is_me: z.boolean(),
  family_role: FamilyRole.nullable().default(null),
  /** Their newest check-in in this circle from the last 7 days. */
  last_checkin: z.object({ kind: CheckinKind, note: z.string().nullable(), at: Instant }).nullable().default(null),
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

export const CreateCircleRequest = z.object({ kind: CircleKind, name: z.string().trim().min(1).max(40), family_type: FamilyType.optional() });
export type CreateCircleRequest = z.infer<typeof CreateCircleRequest>;
export const PatchCircleRequest = z.object({ name: z.string().trim().min(1).max(40).optional(), family_type: FamilyType.nullable().optional() });
export const PatchMemberRequest = z.object({ family_role: FamilyRole.nullable() });
export type PatchMemberRequest = z.infer<typeof PatchMemberRequest>;
export const CheckinRequest = z.object({ kind: CheckinKind, note: z.string().trim().max(80).optional() });
export type CheckinRequest = z.infer<typeof CheckinRequest>;
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
