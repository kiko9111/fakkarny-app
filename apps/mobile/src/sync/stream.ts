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
 * Any other answer (a turn answered at once by rules, an error) is plain JSON with its own
 * status, handled as before. The draft is only ever for show: nothing is stored until `done`,
 * and a message whose stream broke is sent again the plain way (the server answers a message it
 * already has from what it stored, so nothing is written twice).
 *
 * The phone asks this way only from a server that says it sends replies like this
 * (`createStreamSwitch`): every other send is the plain POST it always was.
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
    // The answer was already read: how the connection ended after it does not matter.
    if (!end) {
      // Lost after the stream began: the stream's fault as far as anyone can tell (see the switch below).
      if (streaming()) throw new StreamCutError();
      throw err;
    }
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
 * When to ask for a stream at all.
 *  - Only from a server that says it sends one (`offer`: the REPLY_STREAM_HEADER on its
 *    answers). A server from before streams never says so, and one that stops saying so stops
 *    the asking on every phone without an app update.
 *  - A streamed send that ends without its answer is a strike against streams on this phone
 *    (a proxy that cuts them, a way of reading them that fails here). One can be the
 *    connection, which fails plain sends just as often; two in a row with no stream read to
 *    its end in between switch streaming off for a while: the plain POST always works.
 *  - Cut after it began, it counts at once. With no answer at all it may be that there is no
 *    connection, so it counts only if the plain send after it is answered.
 *  - A send that waited out its whole time counts double: a phone must not sit through that
 *    twice to find out.
 */
export function createStreamSwitch(opts: { offForMs?: number; offered?: boolean } = {}) {
  const offForMs = opts.offForMs ?? 10 * 60_000;
  let offered = opts.offered ?? false;
  let offUntil = 0;
  let strikes = 0;
  /** A streamed send got no answer at all: what it weighs if the plain send after it is answered. */
  let doubt = 0;
  const strike = (weight: number, now: number) => {
    strikes += weight;
    if (strikes >= 2) offUntil = now + offForMs;
  };
  return {
    /** What the server last said about itself. */
    get offered(): boolean {
      return offered;
    },
    offer(yes: boolean): void {
      offered = yes;
    },
    wanted: (now: number) => offered && doubt === 0 && now >= offUntil,
    /** A reply was read as a stream, to its end. */
    worked(): void {
      strikes = 0;
    },
    /** A send that asked for a stream failed with `err`; `slow`: it had used up its time. */
    failed(err: unknown, now: number, slow = false): void {
      if (err instanceof HttpError) return;
      if (err instanceof StreamCutError) strike(slow ? 2 : 1, now);
      else doubt = slow ? 2 : 1;
    },
    /** A plain send ended, answered (2xx) or not. */
    plain(answered: boolean, now: number): void {
      if (doubt && answered) strike(doubt, now);
      doubt = 0;
    },
  };
}
export type StreamSwitch = ReturnType<typeof createStreamSwitch>;

/** A streamed send that failed this close to its time limit is not followed by a second one. */
const NO_TIME_LEFT_MS = 1_000;

/**
 * One chat send, the way the switch says (pure: both ways are injected).
 *
 * A streamed send that ends with no answer is tried once more, at once, the plain way: the
 * server answers a message it already has from the turn it is still working on or from what it
 * stored, so nothing is done twice. A phone whose stream reading fails is so answered as it
 * always was, with no wait for the outbox to send again; with no connection the second try
 * fails at once like the first. Not after a status (the server did answer) and not when the
 * first try used up the time (the outbox sends again, the plain way).
 */
export async function sendForReply<T>(deps: {
  switch: StreamSwitch;
  now: () => number;
  /** How long one try may take. */
  limitMs: number;
  /** `streamed`: the answer came as a stream (a turn the rules answer comes whole either way). */
  stream: () => Promise<{ json: T; streamed: boolean }>;
  plain: () => Promise<T>;
  /** What was shown of the streamed try is void: the plain answer comes whole. */
  onGiveUp: () => void;
}): Promise<T> {
  const plain = async () => {
    try {
      const answer = await deps.plain();
      deps.switch.plain(true, deps.now());
      return answer;
    } catch (err) {
      deps.switch.plain(false, deps.now());
      throw err;
    }
  };
  if (!deps.switch.wanted(deps.now())) return plain();
  const started = deps.now();
  try {
    const { json, streamed } = await deps.stream();
    if (streamed) deps.switch.worked();
    return json;
  } catch (err) {
    const now = deps.now();
    const slow = now - started >= deps.limitMs - NO_TIME_LEFT_MS;
    deps.switch.failed(err, now, slow);
    if (err instanceof HttpError || slow) throw err;
    deps.onGiveUp();
    return plain();
  }
}
