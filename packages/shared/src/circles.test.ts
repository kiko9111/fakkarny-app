import { describe, expect, it } from "vitest";
import { inviteCodeFromText, normalizeInviteCode } from "./circles";

describe("invite codes", () => {
  it("reads a code from a link, a deep link or typed text", () => {
    expect(inviteCodeFromText("https://zaki.app/i/ABCD2345")).toBe("ABCD2345");
    expect(inviteCodeFromText("تعالى معانا على زكي https://api.example.com/i/abcd2345?lang=en")).toBe("ABCD2345");
    expect(inviteCodeFromText("fakkarni://invite/ABCD2345")).toBe("ABCD2345");
    expect(inviteCodeFromText(" abcd-2345 ")).toBe("ABCD2345");
    expect(inviteCodeFromText("hello there my friend")).toBeNull();
    expect(inviteCodeFromText("")).toBeNull();
    expect(normalizeInviteCode("ab cd-23")).toBe("ABCD23");
  });
});
