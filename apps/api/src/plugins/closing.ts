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
 * each connection is closed as soon as its reply has been handed to the network ('finish'),
 * streamed replies included. Closing "idle" connections on a timer instead cut the end off
 * answers still being written.
 */
export function registerClosing(app: FastifyInstance, waitMs = CLOSE_WAIT_MS) {
  let closing = false;
  /** Replies on a connection of their own (not GET /bootstrap's inner ones) not yet written out. */
  const replies = new Set<ServerResponse>();

  app.addHook("onRequest", async (req, reply) => {
    if (!(req.raw.socket instanceof Socket)) return;
    const res = reply.raw;
    replies.add(res);
    const done = () => replies.delete(res);
    res.once("finish", done);
    res.once("close", done);
  });

  app.addHook("preClose", async () => {
    closing = true;
    const until = Date.now() + waitMs;
    for (let ending = endedOf(replies); ending.length > 0 && Date.now() < until; ending = endedOf(replies)) {
      await writtenOut(ending, until - Date.now());
    }
  });

  app.addHook("onResponse", async (req) => {
    const socket = req.raw.socket;
    if (closing && socket instanceof Socket && !socket.destroyed) socket.end(() => socket.destroy());
  });
}

/** The replies that have ended and still wait to be written out. */
const endedOf = (replies: Set<ServerResponse>) => [...replies].filter((res) => res.writableEnded && !res.writableFinished);

/** Resolves once each reply is written out or its connection is gone, or after `ms`. */
function writtenOut(replies: ServerResponse[], ms: number): Promise<void> {
  return new Promise((resolve) => {
    let left = replies.length;
    const timer = setTimeout(resolve, ms);
    for (const res of replies) {
      let seen = false;
      const one = () => {
        if (seen) return;
        seen = true;
        if (--left > 0) return;
        clearTimeout(timer);
        resolve();
      };
      res.once("finish", one);
      res.once("close", one);
    }
  });
}
