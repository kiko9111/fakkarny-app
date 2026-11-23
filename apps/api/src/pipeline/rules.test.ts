import { describe, expect, it } from "vitest";
import { toFriendResponse, type ModelOutput } from "../ai/model";
import { detectScript, detectScriptInContext, fastReply, looksLikeCrisis, replyLang } from "./rules";
import { addressAs, describeNumbers, mustReplyInArabic, rankMemories, replyScript } from "./context";

describe("detectScript", () => {
  it.each([
    ["عندي دكتور الأسنان الأحد الساعة ٦", "arabic"],
    ["meeting مع المدير", "arabic"],
    // Franco: Arabic words in Latin letters, with or without digits.
    ["ana 3ayez afakar el electricity", "franco"],
    ["3andy dentist el 7ad el sa3a 6", "franco"],
    ["3andy doctor yom el talat el sa3a 7", "franco"],
    ["hassan 3aleh 2500 men el shahr elly fat", "franco"],
    ["fakarny akalem mama bokra", "franco"],
    ["lazem a3ady el passport", "franco"],
    ["el ahly kesbo enharda!! ⚽", "franco"],
    ["mahmoud 5ad 3 karateen w hayedfa3 1200 yom el 5amis", "franco"],
    ["enahrda ro7t l mama w et8adeet ma3 o5ty", "franco"],
    ["bat w keshk w ro2a2 w ms7ashy w mesa23a", "franco"],
    ["mama tanya y3ny eh", "franco"],
    ["la2sh fahem", "franco"],
    ["ezayak ya basha", "franco"],
    ["shokran", "franco"],
    // English, including one stray Franco word and English number forms.
    ["ya3ni Ahmed borrowed 500 again and I have the dentist Sunday at 6, ugh", "english"],
    ["Send the report to the manager before 2", "english"],
    ["my flight to Jeddah is Saturday at 7am", "english"],
    ["Hassan moved our meeting to 3pm", "english"],
    ["rent is due on the 5th, there's a late fee if I miss it", "english"],
    ["upload the mp3 to s3 for me", "english"],
    ["pick up the kids at 3:30 today", "english"],
    ["hey! how are you?", "english"],
  ])("%s → %s", (text, script) => expect(detectScript(text)).toBe(script));
});

describe("fastReply", () => {
  it("answers thanks and lone emojis without AI", () => {
    expect(fastReply("شكراً", "arabic", () => 0)).toBe("العفو يا جميل 😊");
    expect(fastReply("Thanks!", "english", () => 0)).toBe("Anytime 😊");
    // Franco thanks get the Arabic reply: the friend reads Franco but never writes it.
    expect(fastReply("shokran", replyLang(detectScript("shokran")), () => 0)).toBe("العفو يا جميل 😊");
    expect(fastReply("😂😂", "english", () => 0)).toBe("😄");
  });

  it("sends anything that could hold a plan to the model", () => {
    expect(fastReply("thanks, and remind me to call mom tomorrow", "english")).toBeNull();
    expect(fastReply("ok", "english")).toBeNull(); // might answer the friend's question
    expect(fastReply("Dentist Sunday at 6", "english")).toBeNull();
  });
});

describe("looksLikeCrisis", () => {
  it.each(["I want to kill myself", "عايز اموت", "عايز أموت", "أنا تعبت ومش عايز أعيش خلاص", "3ayez amoot", "thinking about suicide"])("flags %s", (t) =>
    expect(looksLikeCrisis(t)).toBe(true),
  );
  it.each(["this traffic is killing me", "I'm dying to see the match", "الدنيا زحمة موت"])("does not flag %s", (t) =>
    expect(looksLikeCrisis(t)).toBe(false),
  );
});

describe("toFriendResponse", () => {
  const base: ModelOutput = { reply: ["Hi"], create_items: [], update_items: [], save_memories: [], app_actions: [], crisis: false };

  it("drops nulls so optional fields validate", () => {
    const r = toFriendResponse({
      ...base,
      create_items: [{ type: "task", title: "Call mom", due_at_local: null, remind_at_local: null, follow_up_at_local: null, important: false, alarm: false, nudge: null, repeat_every_minutes: null, debt: null }],
    });
    expect(r.create_items[0]).toEqual({ type: "task", title: "Call mom", important: false, alarm: false });
  });

  it("rejects bad local dates", () => {
    expect(() =>
      toFriendResponse({
        ...base,
        create_items: [{ type: "reminder", title: "x", due_at_local: "tomorrow 6pm", remind_at_local: null, follow_up_at_local: null, important: false, alarm: false, nudge: null, repeat_every_minutes: null, debt: null }],
      }),
    ).toThrow();
  });

  it("folds extra messages into the third instead of failing the turn", () => {
    expect(toFriendResponse({ ...base, reply: ["a", "b", "c", "d"] }).reply).toEqual(["a", "b", "c d"]);
  });

  it("trims and drops empty reply strings", () => {
    expect(toFriendResponse({ ...base, reply: ["  hey  ", " "] }).reply).toEqual(["hey"]);
  });
});

describe("rankMemories", () => {
  const mk = (subject: string, created: string) =>
    ({ id: subject, userId: "u", kind: "person", subject, content: "-", lastUsedAt: null, createdAt: new Date(created) }) as const;
  it("puts memories mentioned in the chat first, then the newest", () => {
    const ranked = rankMemories([mk("Omar", "2026-01-01"), mk("Ahmed", "2026-01-02"), mk("Dokki", "2026-03-01")], "did ahmed pay?", 2);
    expect(ranked.map((m) => m.subject)).toEqual(["Ahmed", "Dokki"]);
  });
});

describe("replyScript", () => {
  it("answers Arabic and Franco in Arabic letters, English in English", () => {
    expect(replyScript(["عندي دكتور بكرة"])).toMatch(/^Egyptian Arabic in Arabic letters/);
    expect(replyScript(["3andy doctor bokra"])).toMatch(/^Egyptian Arabic in ARABIC letters/);
    expect(replyScript(["dentist Sunday at 6"])).toMatch(/^English/);
    expect(replyScript(["👍"])).toBeNull();
    expect(replyScript(["300"])).toBeNull();
  });

  it("requires Arabic letters in the reply for Arabic and Franco messages only", () => {
    expect(mustReplyInArabic(["hassan 3aleh 2500"])).toBe(true);
    expect(mustReplyInArabic(["meeting مع المدير"])).toBe(true);
    expect(mustReplyInArabic(["meeting with Hassan Monday 11am"])).toBe(false);
    expect(mustReplyInArabic(["٣٠٠"])).toBe(true); // Arabic digits: an Arabic keyboard
    expect(mustReplyInArabic(["300"])).toBe(false);
  });

  it("reads a bare name or 'ok' in the language of the conversation", () => {
    // From a real chat: "yara" after Franco was answered in English.
    expect(detectScriptInContext(["tyb ana meraty esmaha eh", "yara"])).toBe("franco");
    expect(detectScriptInContext(["عندي دكتور بكرة", "ok"])).toBe("arabic");
    expect(detectScriptInContext(["my wife's name is", "Yara"])).toBe("english");
    expect(detectScriptInContext(["3andy doctor bokra", "ok", "yara"])).toBe("franco");
    expect(detectScriptInContext(["yara"])).toBe("english");
    expect(detectScriptInContext(["yara"], "arabic")).toBe("arabic");
    // A real English sentence still switches to English.
    expect(detectScriptInContext(["3andy doctor bokra", "what time is it"])).toBe("english");
    expect(mustReplyInArabic(["tyb ana meraty esmaha eh", "yara"])).toBe(true);
  });

  it("addresses the user as a man until a memory says otherwise", () => {
    expect(addressAs([])).toMatch(/^a man/);
    expect(addressAs([{ content: "مراتي، وبتشتغل دكتورة" }])).toMatch(/^a man/);
    expect(addressAs([{ content: "بتتكلم عن نفسها بصيغة المؤنث" }])).toMatch(/^a woman/);
  });

  it("follows the gender setting first", () => {
    expect(addressAs([], "female")).toMatch(/^a woman/);
    expect(addressAs([{ content: "بتتكلم عن نفسها بصيغة المؤنث" }], "male")).toMatch(/^a man/);
  });

  it("gives Zaki the numbers from the user's side", () => {
    const me = "u1";
    const at = new Date("2026-11-20T10:00:00Z");
    const app = {
      circles: [],
      trackers: [],
      sections: [{ id: "s1", name: "أكل", kind: "expense", budget: 3000, circle: null }],
      numbers: {
        monthSpend: { s1: 2350 },
        trackerStats: {},
        tasks: [
          { id: "t1", title: "الحساب", homework: true, status: "done", assignerId: me, assigneeId: "u2", dueAt: null, assigner: { name: "كريم" }, assignee: { name: "عمر" } },
          { id: "t2", title: "تجيب عيش", homework: false, status: "pending", assignerId: "u3", assigneeId: me, dueAt: at, assigner: { name: "منى" }, assignee: { name: "كريم" } },
        ],
        daftar: [{ id: "d1", creatorId: "u3", otherName: "كريم", direction: "i_owe", amount: 120, note: null, status: "pending", creator: { name: "منى" } }],
        splits: [{ id: "p1", title: "عشا", total: 900, peopleJson: [{ name: "كريم", paid: true }, { name: "سارة", paid: false }] }],
      },
    } as unknown as Parameters<typeof describeNumbers>[0];
    const text = describeNumbers(app, me, "Africa/Cairo").join("\n");
    expect(text).toContain("«أكل» 2,350 of 3,000 (78%)");
    expect(text).toContain("id=d1 منى owes the user 120, waiting for the user's OK");
    expect(text).toContain("asked of the user: id=t2 «تجيب عيش» from منى, not answered yet, due 2026-11-20T12:00");
    expect(text).toContain("waiting for the user's review: id=t1 «الحساب» by عمر");
    expect(text).toContain("not paid yet: سارة");
  });
});
