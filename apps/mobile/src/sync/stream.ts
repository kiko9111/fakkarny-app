import { createSseReader } from "./sse";
import { HttpError } from "./queue";

/**
 * A chat message whose answer may arrive as it is written (pure: the transport is injected).
 *
 * The phone asks for `text/event-stream`. A server that has words to show before the turn is
 * done answers with events:
 *   draft  {"i": <bubble>, "d": "<more words>"}   the reply so far, bubble by bubble
 *   reset  {}                                      forget the draft (the reply is being rewritten)
 *   done   {"status": 201, "body": {…}}            the finished answer, exactly what the plain POST returns
 *   error  {"status": 500}                         the turn failed, as that HTTP status would say
 * Any other answer (an older server, a turn answered at once by rules, an error) is plain JSON
 * with its own status, handled as before. The draft is only ever for show: nothing is stored
 * until `done`, and the outbox resends a message whose stream broke (the server answers a
 * resent message from what it stored, so nothing is written twice).
 */

export interface Opened {
  status: number;
  contentType: string;
}

/**
 * One POST. Calls `onStart` when the status and headers are in, `onText` with each piece of the
 * body as it arrives, and resolves when the body is complete. Rejects when there is no answer.
 */
export type Opener = (req: {
  url: string;
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
  onStart: (opened: Opened) => void;
  onText: (piece: string) => void;
}) => Promise<void>;

export interface ReplyHandlers {
  onDraft: (bubble: number, delta: string) => void;
  onReset: () => void;
}

/** The stream ended before its answer: the outbox sends the message again. */
export class StreamCutError extends Error {
  constructor() {
    super("reply stream ended early");
  }
}

export const STREAM_ACCEPT = "text/event-stream, application/json";

const isStream = (contentType: string) => /^text\/event-stream\b/i.test(contentType.trim());

/**
 * POST and read the answer, a stream or not. Resolves with the parsed JSON of the finished
 * answer and whether it came as a stream; throws HttpError for a status that is not 2xx,
 * StreamCutError for a stream without an end, and whatever the transport throws.
 */
export async function postForReply(
  open: Opener,
  req: { url: string; headers: Record<string, string>; body: string; timeoutMs: number },
  handlers: ReplyHandlers,
): Promise<{ json: unknown; streamed: boolean }> {
  let opened: Opened | null = null;
  let plain = "";
  let end: { status: number; body: unknown } | null = null;
  const events = createSseReader((event, data) => {
    if (end) return;
    let value: unknown;
    try {
      value = JSON.parse(data);
    } catch {
      return; // a damaged event is skipped; the finished answer is what counts
    }
    const v = (value ?? {}) as { i?: unknown; d?: unknown; status?: unknown; body?: unknown };
    if (event === "draft") {
      if (typeof v.i === "number" && Number.isInteger(v.i) && v.i >= 0 && v.i < 8 && typeof v.d === "string" && v.d) handlers.onDraft(v.i, v.d);
    } else if (event === "reset") handlers.onReset();
    else if (event === "done" || event === "error") end = { status: typeof v.status === "number" ? v.status : event === "done" ? 200 : 500, body: v.body ?? null };
  });

  const streaming = () => {
    const o = opened as Opened | null;
    return o !== null && isStream(o.contentType);
  };
  try {
    await open({
      ...req,
      headers: { ...req.headers, accept: STREAM_ACCEPT },
      onStart: (o) => (opened = o),
      onText: (piece) => {
        if (streaming()) events.feed(piece);
        else plain += piece;
      },
    });
  } catch (err) {
    // Lost after the stream began: the stream's fault as far as anyone can tell (see the switch below).
    if (streaming()) throw new StreamCutError();
    throw err;
  }

  const start = opened as Opened | null;
  if (!start) throw new StreamCutError();
  if (isStream(start.contentType) && start.status >= 200 && start.status < 300) {
    const finished = end as { status: number; body: unknown } | null;
    if (!finished) throw new StreamCutError();
    if (finished.status < 200 || finished.status >= 300) throw new HttpError(finished.status);
    return { json: finished.body, streamed: true };
  }
  if (start.status < 200 || start.status >= 300) throw new HttpError(start.status);
  return { json: plain ? (JSON.parse(plain) as unknown) : null, streamed: false };
}

/**
 * When to ask for a stream at all. A stream that broke after it started (a proxy that holds the
 * text back, a server that cut it) switches streaming off for a while: the plain POST always
 * works. No answer at all (offline) is not the stream's fault.
 */
export function createStreamSwitch(offForMs = 10 * 60_000) {
  let offUntil = 0;
  return {
    wanted: (now: number) => now >= offUntil,
    /** A send that asked for a stream failed with `err`. */
    failed(err: unknown, now: number): void {
      if (err instanceof StreamCutError) offUntil = now + offForMs;
    },
  };
}
