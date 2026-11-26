/**
 * What of a reply may be shown while it is still being written (the phone draws it as a draft
 * under the user's message; the finished answer replaces it). Pure.
 *
 * Two rules decide how far the draft may run:
 * - Whole words, a few words behind the writing. Arabic letters change shape as a word grows, so
 *   half a word flickers; and a phrase like "your alarm is set" must be seen whole before any of
 *   it is shown.
 * - Nothing from a sentence that says a reminder or alarm is set (`promises`, rules.ts). Zaki
 *   never says so unless the turn really set one (conversation.ts step 3c), and that is only
 *   known when the turn is done: such a sentence, and everything after it, arrives with the
 *   finished answer. A question ("هفكرك الساعة ٤ ولا ٥؟") is not a promise and is shown.
 */

/** Words kept back behind the writing. */
export const DRAFT_LAG_WORDS = 3;

/** How many characters of one bubble may be shown, and whether the draft stops here for good. */
export function draftLimit(text: string, complete: boolean, promises: (sentence: string) => boolean): { upTo: number; stop: boolean } {
  // The same sentences `promisesReminder` reads (rules.ts).
  const sentence = /[^.!؟?\n]+[.!؟?]?/g;
  for (let m = sentence.exec(text); m; m = sentence.exec(text)) {
    const s = m[0];
    const end = m.index + s.length;
    if (!promises(s)) continue;
    const closed = /[.!؟?]$/.test(s) || end < text.length || complete;
    // Still being written: it may yet turn out to be a question. Wait at its start.
    if (!closed) return { upTo: m.index, stop: false };
    if (/[؟?]\s*$/.test(s.trim())) continue;
    return { upTo: m.index, stop: true };
  }
  if (complete) return { upTo: text.length, stop: false };
  // Whole words only, DRAFT_LAG_WORDS behind.
  let upTo = text.length;
  for (let back = 0; back <= DRAFT_LAG_WORDS && upTo > 0; back++) {
    const cut = text.slice(0, upTo).search(/\s+\S*$/);
    upTo = cut < 0 ? 0 : cut;
  }
  return { upTo, stop: false };
}

/**
 * Takes the reply as it is written (`add`, in order, bubble by bubble) and passes on what may be
 * shown. `finish` says the reply is complete (its last bubble closed). After a stop nothing more
 * is passed on.
 */
export function createDraftGate(deps: { send: (bubble: number, delta: string) => void; promises: (sentence: string) => boolean }) {
  const text: string[] = [];
  const sent: number[] = [];
  let stopped = false;

  const release = (bubble: number, complete: boolean) => {
    if (stopped) return;
    const all = text[bubble] ?? "";
    const { upTo, stop } = draftLimit(all, complete, deps.promises);
    const from = sent[bubble] ?? 0;
    if (upTo > from) {
      sent[bubble] = upTo;
      deps.send(bubble, all.slice(from, upTo));
    }
    if (stop) stopped = true;
  };

  return {
    add(bubble: number, delta: string): void {
      if (stopped || !delta) return;
      // A new bubble started: the ones before it are complete.
      for (let b = 0; b < bubble && !stopped; b++) if ((sent[b] ?? 0) < (text[b] ?? "").length) release(b, true);
      text[bubble] = (text[bubble] ?? "") + delta;
      release(bubble, false);
    },
    finish(): void {
      for (let b = 0; b < text.length && !stopped; b++) release(b, true);
    },
    /** True once something was passed on. */
    get shown(): boolean {
      return sent.some((n) => n > 0);
    },
    get stopped(): boolean {
      return stopped;
    },
  };
}

/** Where the draft goes (routes/live-reply.ts sends it to the phone). */
export interface DraftSink {
  /** More words of bubble `bubble` that may be shown now. */
  text(bubble: number, delta: string): void;
  /** What was shown is void: the reply is being written again. */
  reset(): void;
}

/** The persona allows this many bubbles; more are folded into the last one, as in the finished reply (ai/model.ts). */
const MAX_BUBBLES = 3;

/**
 * Between the model layer and the phone: takes the reply as the model writes it and passes on
 * what may be shown (the gate above), bubble numbers as the finished reply will have them.
 * `mustContain`: a bubble is held until it has a letter of the script the reply must be in, and
 * once a bubble ends without one nothing more is passed on: a reply with a bubble in the wrong
 * script is asked for again (ai/model.ts), so none of it should show.
 */
export function createDraftRelay(sink: DraftSink, opts: { promises: (sentence: string) => boolean; mustContain?: RegExp }) {
  const newGate = () => createDraftGate({ send: (bubble, delta) => sink.text(bubble, delta), promises: opts.promises });
  let gate = newGate();
  let held: string[] = [];
  let open: boolean[] = [];
  let last = -1;
  let blocked = false;

  return {
    onReply(bubble: number, delta: string): void {
      if (blocked) return;
      const at = Math.min(bubble, MAX_BUBBLES - 1);
      const before = Math.min(last, MAX_BUBBLES - 1);
      const text = bubble > last && bubble >= MAX_BUBBLES ? ` ${delta}` : delta;
      last = Math.max(last, bubble);
      if (!opts.mustContain) return gate.add(at, text);
      // The bubble before this one is complete and never had the script's letters.
      if (at > before && before >= 0 && !open[before]) {
        blocked = true;
        return;
      }
      if (open[at]) return gate.add(at, text);
      held[at] = (held[at] ?? "") + text;
      if (!opts.mustContain.test(held[at])) return;
      open[at] = true;
      gate.add(at, held[at]);
      held[at] = "";
    },
    onReplyEnd(): void {
      gate.finish();
    },
    onRestart(): void {
      if (gate.shown) sink.reset();
      gate = newGate();
      held = [];
      open = [];
      last = -1;
      blocked = false;
    },
  };
}
