import { describe, expect, it } from "vitest";
import { understand } from "@fakkarni/shared";
import { PERSONA_PROMPT } from "./prompt";
import { describeUnderstood, PHONE_REPLY_PROMPT, templateReply, whenWords } from "./phone-reply";

const now = "2026-11-19T10:00";

describe("phone reply mode", () => {
  it("carries the WELLBEING section word for word", () => {
    const wellbeing = PERSONA_PROMPT.slice(PERSONA_PROMPT.indexOf("# WELLBEING")).trim();
    expect(wellbeing.length).toBeGreaterThan(200);
    expect(PHONE_REPLY_PROMPT).toContain(wellbeing);
  });

  it("says days and times the Egyptian way", () => {
    expect(whenWords("2026-11-20T15:00", now, "arabic")).toBe("بكرة الساعة 3 العصر");
    expect(whenWords("2026-11-22T17:30", now, "arabic")).toBe("يوم الأحد الساعة 5 ونص العصر");
    expect(whenWords("2026-11-19T18:00", now, "english")).toBe("today at 6pm");
  });

  it("tells the model exactly what was done, or what to ask", () => {
    const done = understand({ text: "فكرني بكرة الساعة ٣ أكلم خالد", nowLocal: now });
    expect(describeUnderstood(done, now)).toMatch(/Reminder «.*خالد» tomorrow at 3pm/);
    expect(describeUnderstood(understand({ text: "فكرني أكلم خالد", nowLocal: now }), now)).toContain("ASK: what time");
    expect(describeUnderstood(understand({ text: "تعبان النهارده", nowLocal: now }), now)).toContain("DONE: nothing");
  });

  it("writes its own reply when the model can't", () => {
    const done = understand({ text: "remind me to call mom at 6", nowLocal: now });
    expect(templateReply(done, now, "english")[0]).toContain("today at 6pm");
    expect(templateReply(understand({ text: "فكرني أكلم خالد", nowLocal: now }), now, "arabic")[0]).toContain("إمتى");
  });
});
