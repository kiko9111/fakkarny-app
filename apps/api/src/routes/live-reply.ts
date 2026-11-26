import type { FastifyReply, FastifyRequest } from "fastify";
import { forgetCachedUser } from "../plugins/auth";

/**
 * A chat answer sent while it is written, as server-sent events (the phone reads them in
 * apps/mobile/src/sync/stream.ts):
 *   draft  {"i": <bubble>, "d": "<more words>"}   the reply so far
 *   reset  {}                                      forget the draft (the reply is being written again)
 *   done   {"status": 201, "body": {…}, "timing"}  the finished answer, exactly what the plain POST returns
 *   error  {"status": 500}                         the turn failed
 *
 * The stream opens only when there are words to show. Until then nothing was sent, so a turn the
 * rules answer at once, an error, or a phone that did not ask all get the plain JSON answer as
 * before. Once it is open the answer can only end here: `done` or `error`.
 *
 * Opening takes the response away from Fastify (`hijack`), so its onSend hooks do not run for
 * this answer: nothing is gzipped (a stream must not be held back), and what the hooks do for a
 * write is done here (the caller's saved user row is dropped, plugins/auth.ts).
 */
export function createLiveReply(req: FastifyRequest, reply: FastifyReply) {
  const raw = reply.raw;
  let opened = false;
  let ended = false;
  let ping: NodeJS.Timeout | null = null;

  /** The phone may be gone at any moment (it gives up, loses its connection): a write then does nothing. */
  const write = (text: string) => {
    if (!opened || ended || raw.destroyed || raw.writableEnded) return;
    try {
      raw.write(text);
    } catch {
      // Gone between the check and the write.
    }
  };
  const event = (name: string, data: unknown) => write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);

  const open = () => {
    if (opened || ended) return;
    opened = true;
    reply.hijack();
    // What the hooks before the handler put on the answer (the rate limit's counters) goes along.
    const carried = Object.fromEntries(Object.entries(reply.getHeaders()).filter(([k, v]) => v !== undefined && !/^content-(type|length|encoding)$/i.test(k)));
    raw.on("error", () => {});
    raw.writeHead(200, {
      ...carried,
      "content-type": "text/event-stream; charset=utf-8",
      // Nothing between here and the phone may keep the words back or pack them.
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    });
    raw.write(": zaki\n\n");
    // A quiet stretch (the rest of the turn being written, the database) must not look like a dead connection.
    ping = setInterval(() => write(": ping\n\n"), 10_000);
    ping.unref();
  };

  const close = () => {
    if (ping) clearInterval(ping);
    ping = null;
    const wasOpen = opened && !ended;
    ended = true;
    if (!wasOpen) return;
    if (req.forgetUser) forgetCachedUser(req.forgetUser);
    if (!raw.destroyed && !raw.writableEnded) raw.end();
  };

  return {
    /** True once the answer is a stream: it must end with `done` or `fail`. */
    get opened(): boolean {
      return opened;
    },
    text(bubble: number, delta: string): void {
      open();
      event("draft", { i: bubble, d: delta });
    },
    reset(): void {
      event("reset", {});
    },
    done(status: number, body: unknown, timing?: Record<string, number>): void {
      event("done", { status, body, ...(timing ? { timing } : {}) });
      close();
    },
    fail(status: number): void {
      event("error", { status });
      // The headers said 200 long ago. For this server's own count of failed requests and its
      // request log (both read the status when the answer ends), the turn is what it was.
      if (opened && !ended) raw.statusCode = status;
      close();
    },
  };
}

export type LiveReply = ReturnType<typeof createLiveReply>;

/** The caller reads an answer that arrives as events (`Accept: text/event-stream`). */
export const wantsLiveReply = (req: FastifyRequest): boolean => /(^|[\s,])text\/event-stream\b/i.test(String(req.headers.accept ?? ""));
