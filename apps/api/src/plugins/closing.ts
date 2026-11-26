import type { ServerResponse } from "node:http";
import { Socket } from "node:net";
import type { FastifyInstance } from "fastify";

/** How long the close waits for replies that have ended to be written out. */
export const CLOSE_WAIT_MS = 5_000;

/**
 * How the app closes, the first step of the server's stop (server.ts): every reply arrives whole,
 * and no connection is kept open after its reply.
 *
 * Node's close() destroys the connections it takes for idle, and it takes one whose reply has
 * ended for idle while the end of that reply still waits to be written (a big answer, a slow
 * caller): the caller got a cut answer. So the close first waits, up to CLOSE_WAIT_MS, for
 * replies that have ended to be written out.
 *
 * The connections of replies still in flight stay open, and once its reply is sent a caller may
 * keep its connection (keep-alive: up to 72 s, past a deploy's drain). So while the app closes,
 * the last reply asked for on a connection says `Connection: close`, and each connection is
 * closed as soon as its last reply has been handed to the network ('finish'), streamed replies
 * included. Closing "idle" connections on a timer instead cut the end off answers still being
 * written.
 *
 * A caller may send its next request on a connection before the answer to the last one
 * (pipelining). Node answers them in order, and hands the connection to the next reply as soon
 * as one is out, before this plugin hears that it is out: a connection is closed only once no
 * reply is left on it, and only its last reply says `Connection: close` (Node drops the replies
 * queued behind one that says it).
 */
export function registerClosing(app: FastifyInstance, waitMs = CLOSE_WAIT_MS) {
  let closing = false;
  /** Replies on a connection of their own (not GET /bootstrap's inner ones) not yet written out. */
  const replies = new Set<ServerResponse>();
  /** How many requests on each connection still wait for their reply to be written out. */
  const asked = new WeakMap<Socket, number>();
  /** Wakes the close's wait whenever a reply is written out or its connection is gone. */
  let wake: (() => void) | undefined;

  app.addHook("onRequest", async (req, reply) => {
    const socket = req.raw.socket;
    if (!(socket instanceof Socket)) return;
    const res = reply.raw;
    replies.add(res);
    asked.set(socket, (asked.get(socket) ?? 0) + 1);
    let open = true;
    const done = () => {
      if (!open) return;
      open = false;
      replies.delete(res);
      asked.set(socket, Math.max(0, (asked.get(socket) ?? 1) - 1));
      socket.removeListener("close", done);
      wake?.();
    };
    res.once("finish", done);
    res.once("close", done);
    // A reply queued behind another on a connection that dies never gets the connection, so it
    // never hears 'finish' or 'close' itself.
    socket.once("close", done);
  });

  app.addHook("preClose", async () => {
    closing = true;
    const until = Date.now() + waitMs;
    while (Date.now() < until && endedOf(replies).length > 0) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, until - Date.now());
        wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      wake = undefined;
    }
  });

  // The caller learns that the connection ends after this reply, so it does not send its next
  // request on it. Not when it already sent one (its count includes this request).
  app.addHook("onSend", async (req, reply, payload) => {
    const socket = req.raw.socket;
    if (closing && socket instanceof Socket && (asked.get(socket) ?? 0) <= 1) reply.header("connection", "close");
    return payload;
  });

  app.addHook("onResponse", async (req) => {
    const socket = req.raw.socket;
    if (closing && socket instanceof Socket && !socket.destroyed && !heldByAnother(socket)) socket.end(() => socket.destroy());
  });
}

/**
 * Whether the next reply on the connection holds it already: Node hands the connection over in
 * its own 'finish' listener, which runs before Fastify's (Node's close() reads the same field).
 */
const heldByAnother = (socket: Socket) => Boolean((socket as Socket & { _httpMessage?: unknown })._httpMessage);

/** The replies that have ended and still wait to be written out. */
const endedOf = (replies: Set<ServerResponse>) => [...replies].filter((res) => res.writableEnded && !res.writableFinished);
