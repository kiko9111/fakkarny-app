import type Anthropic from "@anthropic-ai/sdk";
import { createReplyReader } from "./reply-stream";

/**
 * One chat turn read while the model writes it.
 *
 * The turn is the same request as before (the tools, `respond` strict). It is only asked for as
 * a stream, so the words of the reply can be passed on while the rest of the turn (items,
 * memories, app tools) is still being written. Nothing here decides the turn: the finished
 * message is parsed and validated exactly as a plain request's is.
 */

/** What the model layer tells its caller while a reply is being written. */
export interface ReplyLive {
  /** More words of bubble `bubble` (0-based), in order. */
  onReply(bubble: number, delta: string): void;
  /** Every bubble of the reply is written (the rest of the turn may still be on its way). */
  onReplyEnd(): void;
  /** What was passed on is void: the reply is being written again. */
  onRestart(): void;
}

/** The part of the SDK's message stream this needs (so a test can stand in for it). */
export interface ToolTurnStream {
  on(event: "streamEvent", listener: (event: Anthropic.MessageStreamEvent) => void): unknown;
  abort(): void;
  finalMessage(): Promise<Anthropic.Message>;
}

/** The stream did not finish in time. The caller asks again without a stream. */
export class ReplyStreamTimeout extends Error {
  constructor() {
    super("reply stream timed out");
    this.name = "ReplyStreamTimeout";
  }
}

/**
 * Read one streamed tool turn to its end. The words of the `respond` tool's reply go to `live`
 * as they arrive; the finished message is returned. Rejects with ReplyStreamTimeout after
 * `timeoutMs` (the SDK's own timeout only covers the wait for the stream to begin), and with
 * whatever the stream fails with.
 */
export async function readToolTurn(
  stream: ToolTurnStream,
  live: Pick<ReplyLive, "onReply" | "onReplyEnd">,
  opts: { timeoutMs: number; tool?: string; /** What the request had used when the stream began (told also when it then breaks). */ onBegun?: (usage: Anthropic.Usage) => void },
): Promise<Anthropic.Message> {
  const tool = opts.tool ?? "respond";
  let respondAt: number | null = null;
  let ended = false;
  // Showing the draft must never cost the turn. The first time passing words on fails, nothing
  // more is passed on (half a draft is worse than none); the turn itself carries on.
  let dead = false;
  const safely = (pass: () => void) => {
    if (dead) return;
    try {
      pass();
    } catch {
      dead = true;
    }
  };
  const end = () => {
    if (ended) return;
    ended = true;
    safely(() => live.onReplyEnd());
  };
  const reader = createReplyReader((bubble, delta) => safely(() => live.onReply(bubble, delta)));

  stream.on("streamEvent", (event) => {
    if (event.type === "message_start") opts.onBegun?.(event.message.usage);
    if (dead) return;
    safely(() => {
      if (event.type === "content_block_start") {
        if (respondAt === null && event.content_block.type === "tool_use" && event.content_block.name === tool) respondAt = event.index;
      } else if (event.type === "content_block_delta") {
        if (event.index !== respondAt || event.delta.type !== "input_json_delta") return;
        reader.feed(event.delta.partial_json);
        if (reader.finished) end();
      } else if (event.type === "content_block_stop") {
        if (event.index === respondAt) end();
      }
    });
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    stream.abort();
  }, opts.timeoutMs);
  try {
    return await stream.finalMessage();
  } catch (err) {
    if (timedOut) throw new ReplyStreamTimeout();
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * How a turn is asked for when its caller wants the words as they are written:
 * - "eager": the reply arrives word by word (`eager_input_streaming` on `respond`).
 * - "plain": a stream without it. The API holds each field of a tool call back until it is
 *   complete, so the reply arrives in one piece, still ahead of the rest of the turn.
 * - "off": no stream; the turn arrives whole, as before.
 */
export type StreamMode = "eager" | "plain" | "off";

/** Why a streamed try was not the answer: the API refused it (400), it ran out of time, or it was cut off. */
export type StreamLost = "refused" | "timeout" | "cut";

/** After this many streamed turns in a row that broke or ran out of time, streams pause. */
const BROKEN_BEFORE_PAUSE = 2;
/** How long they pause for. */
const BROKEN_PAUSE_MS = 10 * 60_000;

/**
 * Which way to ask right now.
 *
 * Steps down when the API refuses a streamed request (400) that it then accepts without the
 * stream: "eager" → "plain" → "off". Stays there for the life of the process, so one refusal
 * costs one turn a fraction of a second, not every turn.
 *
 * A stream that breaks or runs out of time is not a refusal, and each one costs its turn a wait
 * before the plain request. Two in a row pause streams for ten minutes; after the pause the next
 * turn tries again, and one more failure pauses them again.
 */
export function createStreamModes(start: StreamMode = "eager", now: () => number = Date.now) {
  let mode: StreamMode = start;
  let broken = 0;
  let pausedUntil = 0;
  return {
    get mode(): StreamMode {
      return now() < pausedUntil ? "off" : mode;
    },
    /** Refused as a stream, accepted without. */
    refused(): void {
      mode = mode === "eager" ? "plain" : "off";
    },
    /** A streamed turn broke on the way or ran out of time. */
    broke(): void {
      if (++broken >= BROKEN_BEFORE_PAUSE) pausedUntil = now() + BROKEN_PAUSE_MS;
    },
    /** A streamed turn was read to its end. */
    worked(): void {
      broken = 0;
    },
  };
}

/** FAKKARNI_CHAT_STREAM: "0" = never stream, "plain" = stream without eager input, else word by word. */
export function streamModeFromEnv(value: string | undefined): StreamMode {
  return value === "0" ? "off" : value === "plain" ? "plain" : "eager";
}
