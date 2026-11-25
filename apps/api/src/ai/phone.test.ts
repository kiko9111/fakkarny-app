import { describe, expect, it } from "vitest";
import { addMinutesLocal, phoneTime, phoneToFriendResponse } from "./phone";
import { PHONE_PROMPT } from "../persona/phone";
import { PERSONA_PROMPT } from "../persona/prompt";
import { extractPhoneJson, PHONE_OUTPUT_JSON_SCHEMA, phoneMessages } from "@fakkarni/shared";

const NOW = "2026-11-19T10:00";

describe("phone brain", () => {
  it("keeps the WELLBEING rules word for word", () => {
    const wellbeing = PERSONA_PROMPT.slice(PERSONA_PROMPT.indexOf("# WELLBEING")).trim();
    expect(wellbeing.length).toBeGreaterThan(300);
    expect(PHONE_PROMPT).toContain(wellbeing);
  });

  it("stays short enough for a phone model (about 2k tokens)", () => {
    expect(PHONE_PROMPT.length).toBeLessThan(8000);
  });

  it("reads relative and absolute times", () => {
    expect(addMinutesLocal("2026-11-19T23:30", 60)).toBe("2026-11-20T00:30");
    expect(phoneTime("+60", NOW)).toBe("2026-11-19T11:00");
    expect(phoneTime("+ 90 min", NOW)).toBe("2026-11-19T11:30");
    expect(phoneTime("2026-11-22 18:00", NOW)).toBe("2026-11-22T18:00");
    expect(phoneTime("2026-11-22T18:00:00", NOW)).toBe("2026-11-22T18:00");
    expect(phoneTime("2026-11-22", NOW)).toBe("2026-11-22T09:00");
    expect(phoneTime("bokra", NOW)).toBeUndefined();
    expect(phoneTime("2026-11-22T25:00", NOW)).toBeUndefined();
    expect(phoneTime("", NOW)).toBeUndefined();
  });

  it("turns the compact answer into a strict FriendResponse", () => {
    const r = phoneToFriendResponse(
      {
        reply: ["تمام، هفكرك الأحد الساعة ٥"],
        items: [
          { type: "reminder", title: "الدكتور", when: "2026-11-22T18:00", remind: "2026-11-22T17:00", follow_up: "2026-11-22T20:00" },
          { type: "debt", title: "أحمد استلف", person: "أحمد", amount: 500, direction: "owed_to_me" },
          { type: "debt", title: "no amount", person: "x" },
          { type: "reminder", title: "مية", when: "+60", repeat_minutes: 60 },
        ],
        updates: [{ id: "i1", status: "done" }, { id: "i2" }],
        memories: [{ kind: "person", subject: "عمر", content: "ابنها" }],
        actions: [{ kind: "log_money", amount: 300, money_kind: "expense", section: "بنزين", title: "بنزين" }],
        crisis: false,
      },
      NOW,
    );
    expect(r.create_items).toHaveLength(3);
    expect(r.create_items[0]).toMatchObject({ type: "reminder", due_at_local: "2026-11-22T18:00", remind_at_local: "2026-11-22T17:00", follow_up_at_local: "2026-11-22T20:00" });
    expect(r.create_items[1]!.debt).toEqual({ person: "أحمد", amount: 500, direction: "owed_to_me" });
    expect(r.create_items[2]).toMatchObject({ due_at_local: "2026-11-19T11:00", remind_at_local: "2026-11-19T11:00", repeat_every_minutes: 60 });
    expect(r.update_items).toEqual([{ id: "i1", status: "done" }]);
    expect(r.app_actions).toEqual([expect.objectContaining({ kind: "log_money", amount: 300 })]);
  });

  it("rejects an answer with no reply", () => {
    expect(() => phoneToFriendResponse({ reply: [], crisis: false }, NOW)).toThrow();
    expect(() => phoneToFriendResponse("not json", NOW)).toThrow();
  });

  it("pulls JSON out of a model's text", () => {
    expect(extractPhoneJson('{"reply":["hi"],"crisis":false}')).toEqual({ reply: ["hi"], crisis: false });
    expect(extractPhoneJson('<think>hmm</think>\n```json\n{"reply":["hi"],"crisis":false}\n```')).toEqual({ reply: ["hi"], crisis: false });
    expect(extractPhoneJson("sorry")).toBeNull();
  });

  it("prompts the phone with context first and the last message last", () => {
    const m = phoneMessages({ system: "S", context: "C", persona: "p", history: [{ role: "user", text: "a" }, { role: "assistant", text: "b" }, { role: "user", text: "c" }] });
    expect(m[0]).toEqual({ role: "system", content: "S" });
    expect(m.at(-1)).toEqual({ role: "user", content: "c" });
    expect(m.at(-2)!.content).toBe(JSON.stringify({ reply: ["b"], crisis: false }));
    expect(PHONE_OUTPUT_JSON_SCHEMA.required).toEqual(["reply", "crisis"]);
  });
});

describe("cleanPhoneReply", () => {
  it("keeps good Egyptian bubbles, cuts leaked JSON and notes, drops wrong script and Modern Standard", async () => {
    const { cleanPhoneReply } = await import("../persona/phone-reply");
    expect(cleanPhoneReply(["أنا هنا يا بطل! | crisis\":false}”"], "arabic")).toEqual(["أنا هنا يا بطل!"]);
    expect(cleanPhoneReply(["تمام 😊", "نتكلم بكرة؟ بكرة؟ بكرة؟ بكرة؟"], "arabic")).toEqual(["تمام 😊"]);
    expect(cleanPhoneReply(["يا حبيبي يا غالي يا بطل"], "arabic")).toEqual(["يا حبيبي يا غالي يا بطل"]);
    expect(cleanPhoneReply(["ممتاز يا كريم (Note: The user wrote"], "arabic")).toEqual(["ممتاز يا كريم"]);
    expect(cleanPhoneReply(["Ok, I'll send it then!"], "arabic")).toEqual([]);
    expect(cleanPhoneReply(["Ahly kesbo enharda! 😊 بكرة"], "arabic")).toEqual([]);
    expect(cleanPhoneReply(["هل تريد أن نطبخ كيك معاً؟", "تمام 💛"], "arabic")).toEqual(["تمام 💛"]);
    expect(cleanPhoneReply(["Sure, 4pm it is!", "تمام"], "english")).toEqual(["Sure, 4pm it is!"]);
  });
});
