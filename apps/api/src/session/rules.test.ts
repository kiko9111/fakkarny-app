import { describe, expect, it } from "vitest";
import { SESSION_PROMPT } from "../persona/session";
import { atMessageCap, freeSessions, isIdle, NOT_A_DOCTOR, opener } from "./rules";

const at = (iso: string) => new Date(iso);

describe("session rules", () => {
  it("gives a free user one session in any seven days, and says when the next opens", () => {
    const now = at("2026-11-22T10:00:00Z");
    expect(freeSessions([], false, now)).toEqual({ left: 1, nextAt: null });
    expect(freeSessions([at("2026-11-20T09:00:00Z")], false, now)).toEqual({ left: 0, nextAt: at("2026-11-27T09:00:00Z") });
    expect(freeSessions([at("2026-11-14T09:00:00Z")], false, now)).toEqual({ left: 1, nextAt: null });
    expect(freeSessions([at("2026-11-20T09:00:00Z"), at("2026-11-21T09:00:00Z")], true, now)).toEqual({ left: null, nextAt: null });
  });

  it("closes sessions that were left, and caps long ones", () => {
    const start = at("2026-11-22T10:00:00Z");
    expect(isIdle(start, null, at("2026-11-22T21:00:00Z"))).toBe(false);
    expect(isIdle(start, null, at("2026-11-22T22:30:00Z"))).toBe(true);
    expect(isIdle(start, at("2026-11-22T20:00:00Z"), at("2026-11-22T22:30:00Z"))).toBe(false);
    expect(atMessageCap(29)).toBe(false);
    expect(atMessageCap(30)).toBe(true);
  });

  it("opens every session by saying Zaki is not a doctor, and never calls itself therapy", () => {
    expect(NOT_A_DOCTOR.arabic).toContain("مش دكتور");
    expect(NOT_A_DOCTOR.english).toContain("not a doctor");
    for (const mode of ["talk", "vent", "night", "big_day"] as const)
      for (const mood of [1, 3, 5])
        for (const lang of ["arabic", "english"] as const) {
          const line = opener(mode, mood, lang);
          expect(line.length).toBeGreaterThan(10);
          expect(line).not.toMatch(/therap|treatment|علاج|معالج/i);
        }
    expect(opener("talk", 1, "english")).not.toBe(opener("talk", 5, "english"));
  });

  it("keeps the safety section in the prompt (never weaken)", () => {
    expect(SESSION_PROMPT).toContain("# SAFETY (never weaken these rules)");
    expect(SESSION_PROMPT).toContain("Set crisis: true");
    expect(SESSION_PROMPT).toContain("give the local helpline from the context with its number written out");
    expect(SESSION_PROMPT).toContain("not a doctor");
    expect(SESSION_PROMPT).toContain("Never diagnose");
    expect(SESSION_PROMPT).toContain("you never replace them");
  });
});
