import type { ReplyHandlers } from "../sync/stream";

/**
 * The browser preview has no server to stream a reply from, so a finished answer is shown the
 * way a stream would have shown it: a few words at a time (pure; the pause is injected).
 * Only the look is the same. The real server also holds words back until it knows they are true
 * (apps/api/src/pipeline/draft.ts); the sample answers are written by rules and need none of that.
 */

/** As on the server: a reply shows as at most three bubbles while it is written. */
const MAX_BUBBLES = 3;

/** The reply's bubbles cut into what to show at each step, in at most about `maxSteps` steps. */
export function replaySteps(replies: string[], maxSteps = 36): { bubble: number; delta: string }[] {
  const words = replies.slice(0, MAX_BUBBLES).map((text) => text.match(/\s*\S+/g) ?? []);
  const total = words.reduce((n, list) => n + list.length, 0);
  const per = Math.max(1, Math.ceil(total / Math.max(1, maxSteps)));
  const steps: { bubble: number; delta: string }[] = [];
  for (const [bubble, list] of words.entries()) for (let i = 0; i < list.length; i += per) steps.push({ bubble, delta: list.slice(i, i + per).join("") });
  return steps;
}

/** Zaki's bubbles in an answer to POST /messages, each at its own place (anything else has none). */
export function repliesOf(answer: unknown): string[] {
  const replies = (answer as { replies?: unknown } | null)?.replies;
  if (!Array.isArray(replies)) return [];
  return replies.map((r) => {
    const text = (r as { text?: unknown } | null)?.text;
    return typeof text === "string" ? text : "";
  });
}

/** Hand the answer's words on step by step, then resolve: the caller stores the answer after. */
export async function replayReply(answer: unknown, live: ReplyHandlers, pause: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)), everyMs = 28): Promise<void> {
  for (const step of replaySteps(repliesOf(answer))) {
    live.onDraft(step.bubble, step.delta);
    await pause(everyMs);
  }
}
