import { describe, expect, it } from "vitest";
import { inviteShareText, inviteState, MAX_CIRCLE_MEMBERS, newInviteCode } from "./rules";

describe("circle rules", () => {
  const now = new Date("2026-11-22T10:00:00Z");
  const live = { expiresAt: new Date("2026-12-22T10:00:00Z"), revokedAt: null };
  it("makes typeable invite codes", () => {
    expect(newInviteCode()).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
  });
  it("decides whether an invite can still be used", () => {
    expect(inviteState(live, { memberCount: 2, isMember: false }, now)).toBe("open");
    expect(inviteState(live, { memberCount: 2, isMember: true }, now)).toBe("already_member");
    expect(inviteState({ ...live, expiresAt: now }, { memberCount: 2, isMember: false }, now)).toBe("expired");
    expect(inviteState({ ...live, revokedAt: now }, { memberCount: 2, isMember: false }, now)).toBe("expired");
    expect(inviteState(live, { memberCount: MAX_CIRCLE_MEMBERS, isMember: false }, now)).toBe("full");
  });
  it("writes the WhatsApp message in the user's language with the link last", () => {
    const ar = inviteShareText({ lang: "ar", circleName: "بيتنا", kind: "family", url: "https://x/i/ABCD2345" });
    expect(ar).toContain("«بيتنا»");
    expect(ar).toContain("زكي");
    expect(ar.endsWith("https://x/i/ABCD2345")).toBe(true);
    expect(inviteShareText({ lang: "en", circleName: "Trip", kind: "friends", url: "https://x/i/A" })).toContain('"Trip"');
  });
});
