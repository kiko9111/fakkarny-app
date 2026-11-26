import { describe, expect, it } from "vitest";
import { createDraftGate, createDraftRelay, draftLimit } from "./draft";
import { promisesReminder, saysReminderSet } from "./rules";

const promises = (s: string) => /I'll remind|alarm is set|هفكرك/.test(s);

/** Feed a reply piece by piece; returns what was shown per bubble and whether the gate stopped. */
function run(pieces: [number, string][], finish = true) {
  const shown: string[] = [];
  const gate = createDraftGate({ send: (b, d) => (shown[b] = (shown[b] ?? "") + d), promises });
  const steps: string[][] = [];
  for (const [b, d] of pieces) {
    gate.add(b, d);
    steps.push([...shown]);
  }
  if (finish) gate.finish();
  return { shown, steps, stopped: gate.stopped, any: gate.shown };
}

const words = (bubble: number, text: string): [number, string][] => text.split(/(?<=\s)/).map((w) => [bubble, w]);

describe("draftLimit", () => {
  it("shows whole words, a few words behind the writing", () => {
    const text = "Good morning dear friend how are";
    const { upTo, stop } = draftLimit(text, false, promises);
    expect(stop).toBe(false);
    expect(text.slice(0, upTo)).toBe("Good morning");
    expect(draftLimit("Good", false, promises).upTo).toBe(0);
  });

  it("shows everything once the bubble is complete", () => {
    expect(draftLimit("Good morning dear friend", true, promises)).toEqual({ upTo: 24, stop: false });
  });

  it("waits at a sentence that may be a promise, and stops when it is one", () => {
    const text = "Okay! I'll remind you at";
    expect(draftLimit(text, false, promises)).toEqual({ upTo: 5, stop: false });
    expect(draftLimit("Okay! I'll remind you at 4.", false, promises)).toEqual({ upTo: 5, stop: true });
    expect(draftLimit("Okay! I'll remind you at 4", true, promises)).toEqual({ upTo: 5, stop: true });
  });

  it("lets a question through", () => {
    const text = "I'll remind you at 4 or 5?";
    const writing = draftLimit(text, false, promises);
    expect(writing.stop).toBe(false);
    expect(text.slice(0, writing.upTo)).toBe("I'll remind you");
    expect(draftLimit(text, true, promises)).toEqual({ upTo: text.length, stop: false });
  });
});

describe("createDraftGate", () => {
  it("passes a plain reply on word by word and completes it", () => {
    const text = "صباح الخير يا منى، عاملة ايه النهارده؟ 💛";
    const out = run(words(0, text));
    expect(out.shown).toEqual([text]);
    expect(out.stopped).toBe(false);
    // Never a cut inside a word, and never ahead of what was written.
    let written = "";
    for (const [i, [, piece]] of words(0, text).entries()) {
      written += piece;
      const s = out.steps[i]![0] ?? "";
      expect(written.startsWith(s)).toBe(true);
      expect(s === "" || /\S$/.test(s)).toBe(true);
      expect(s === "" || s === written || /^\s/.test(written.slice(s.length))).toBe(true);
    }
  });

  it("completes a bubble when the next one starts", () => {
    const out = run([...words(0, "First bubble here"), ...words(1, "Second")], false);
    expect(out.shown[0]).toBe("First bubble here");
    expect(out.shown[1]).toBeUndefined();
  });

  it("never shows a sentence that says a reminder is set, or anything after it", () => {
    const out = run([...words(0, "تمام يا منى، بكرة الساعة ٥ هفكرك تشتري لبن 💛"), ...words(1, "يومك حلو")]);
    expect(out.stopped).toBe(true);
    expect(out.shown[0] ?? "").not.toContain("هفكرك");
    expect(out.shown[1]).toBeUndefined();
    for (const step of out.steps) expect(promisesReminder([step.join("\n")])).toBe(false);
  });

  it("keeps the sentences before the promise", () => {
    const out = run(words(0, "Great idea. I'll remind you tomorrow at 4. Sleep well."));
    expect(out.shown).toEqual(["Great idea."]);
    expect(out.stopped).toBe(true);
  });

  it("never shows part of a phrase like 'alarm is set' before the turn is checked", () => {
    const out = run(words(0, "Sure thing, your alarm is set for 6."));
    for (const step of out.steps) expect(step[0] ?? "").not.toMatch(/alarm/);
    expect(out.shown[0] ?? "").not.toMatch(/alarm/);
  });

  it("shows a question that only mentions reminding", () => {
    const text = "هفكرك الساعة ٤ ولا ٥؟";
    expect(run(words(0, text)).shown).toEqual([text]);
  });

  it("says whether anything was shown", () => {
    expect(run(words(0, "I'll remind you at 4.")).any).toBe(false);
    expect(run(words(0, "Hello there friend")).any).toBe(true);
  });

  it("gives the same result however the text is cut", () => {
    const text = "أهلا يا منى! عاملة ايه؟ قوليلي أخبارك النهارده";
    const whole = run([[0, text]]).shown;
    for (let cut = 0; cut <= text.length; cut++) expect(run([[0, text.slice(0, cut)], [0, text.slice(cut)]]).shown).toEqual(whole);
    expect(run([...text].map((ch) => [0, ch] as [number, string])).shown).toEqual(whole);
  });
});

describe("createDraftRelay", () => {
  /** A phone: what it shows per bubble, and how often it was told to forget it. */
  function phone() {
    const shown: string[] = [];
    let resets = 0;
    return {
      shown,
      get resets() {
        return resets;
      },
      sink: {
        text: (b: number, d: string) => void (shown[b] = (shown[b] ?? "") + d),
        reset: () => {
          resets++;
          shown.length = 0;
        },
      },
    };
  }

  it("passes on a reply as it is written and completes it at the end", () => {
    const p = phone();
    const relay = createDraftRelay(p.sink, { promises: saysReminderSet });
    for (const [b, d] of [...words(0, "صباح الخير يا منى، يومك عامل إيه؟"), ...words(1, "قوليلي أخبارك")]) relay.onReply(b, d);
    expect(p.shown[0]).toBe("صباح الخير يا منى، يومك عامل إيه؟");
    relay.onReplyEnd();
    expect(p.shown).toEqual(["صباح الخير يا منى، يومك عامل إيه؟", "قوليلي أخبارك"]);
  });

  it("holds back the sentence that says a reminder is set, with the app's own rule", () => {
    const p = phone();
    const relay = createDraftRelay(p.sink, { promises: saysReminderSet });
    for (const [b, d] of words(0, "تمام يا منى. هفكرك الساعة ٥ 💛")) relay.onReply(b, d);
    relay.onReplyEnd();
    expect(p.shown).toEqual(["تمام يا منى."]);
  });

  it("folds a fourth bubble into the third, as the finished reply does", () => {
    const p = phone();
    const relay = createDraftRelay(p.sink, { promises: saysReminderSet });
    for (const [b, d] of [...words(0, "one"), ...words(1, "two"), ...words(2, "three"), ...words(3, "four more"), ...words(4, "five")]) relay.onReply(b, d);
    relay.onReplyEnd();
    expect(p.shown).toEqual(["one", "two", "three four more five"]);
  });

  it("shows nothing of a reply with a bubble in the wrong script", () => {
    // One bubble without an Arabic letter and the whole reply is asked for again (ai/model.ts).
    const p = phone();
    const relay = createDraftRelay(p.sink, { promises: saysReminderSet, mustContain: /[\u0600-\u06FF]/ });
    for (const [b, d] of [...words(0, "sabah el kheir ya Mona"), ...words(1, "😂😂 أيوه كده بقى"), ...words(2, "يومك عامل إيه")]) relay.onReply(b, d);
    relay.onReplyEnd();
    expect(p.shown).toEqual([]);
    // Written again in the right script: shown from the start.
    relay.onRestart();
    expect(p.resets).toBe(0);
    for (const [b, d] of [...words(0, "صباح الخير يا منى"), ...words(1, "يومك عامل إيه")]) relay.onReply(b, d);
    relay.onReplyEnd();
    expect(p.shown).toEqual(["صباح الخير يا منى", "يومك عامل إيه"]);
  });

  it("holds a bubble until it has a letter of the right script, then shows all of it", () => {
    const p = phone();
    const relay = createDraftRelay(p.sink, { promises: saysReminderSet, mustContain: /[\u0600-\u06FF]/ });
    for (const [b, d] of words(0, "😂😂 ")) relay.onReply(b, d);
    expect(p.shown).toEqual([]);
    for (const [b, d] of [...words(0, "أيوه كده بقى يا منى"), ...words(1, "OK 👍 تمام")]) relay.onReply(b, d);
    relay.onReplyEnd();
    expect(p.shown).toEqual(["😂😂 أيوه كده بقى يا منى", "OK 👍 تمام"]);
  });

  it("keeps folding late bubbles in the wrong script into a third one that has the right letters", () => {
    const p = phone();
    const relay = createDraftRelay(p.sink, { promises: saysReminderSet, mustContain: /[\u0600-\u06FF]/ });
    for (const [b, d] of [...words(0, "أهلا"), ...words(1, "يا منى"), ...words(2, "تمام"), ...words(3, "ok")]) relay.onReply(b, d);
    relay.onReplyEnd();
    expect(p.shown).toEqual(["أهلا", "يا منى", "تمام ok"]);
  });

  it("tells the phone to forget the draft only when it showed one", () => {
    const p = phone();
    const relay = createDraftRelay(p.sink, { promises: saysReminderSet });
    relay.onRestart();
    expect(p.resets).toBe(0);
    for (const [b, d] of words(0, "hello there my good friend")) relay.onReply(b, d);
    relay.onRestart();
    expect(p.resets).toBe(1);
    relay.onRestart();
    expect(p.resets).toBe(1);
    // The reply written again starts from nothing.
    for (const [b, d] of words(0, "second try")) relay.onReply(b, d);
    relay.onReplyEnd();
    expect(p.shown).toEqual(["second try"]);
  });
});
