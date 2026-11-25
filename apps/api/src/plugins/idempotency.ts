import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { INSTALL_ID_HEADER } from "@fakkarni/shared";

/**
 * Writes the phone saved while offline are replayed later with an x-idempotency-key; a replay of
 * a key this server already answered gets the same answer back instead of a second write (a lost
 * answer must not log a tracker step twice). Keyed by the phone's install id, kept in memory for
 * a day. A restart forgets the keys: rare, and the worst case is one repeated tap.
 */
export const IDEMPOTENCY_HEADER = "x-idempotency-key";
const DAY = 86_400_000;
const MAX_KEYS = 50_000;

export function registerIdempotency(app: FastifyInstance, now: () => number = Date.now) {
  const seen = new Map<string, { status: number; body: string; at: number }>();
  const keyOf = (req: FastifyRequest) => {
    if (req.method === "GET") return null;
    const k = req.headers[IDEMPOTENCY_HEADER];
    const who = req.headers[INSTALL_ID_HEADER];
    if (typeof k !== "string" || !/^[\w-]{8,80}$/.test(k) || typeof who !== "string") return null;
    return createHash("sha256").update(`${who}\n${req.method} ${req.url.split("?")[0]}\n${k}`).digest("hex");
  };

  app.addHook("onRequest", async (req, reply) => {
    const k = keyOf(req);
    const hit = k ? seen.get(k) : undefined;
    if (!hit || now() - hit.at > DAY) return;
    return reply.code(hit.status).header("content-type", "application/json; charset=utf-8").header("x-idempotent-replay", "1").send(hit.body);
  });

  app.addHook("onSend", async (req, reply, payload) => {
    const k = keyOf(req);
    if (k && reply.statusCode < 300 && !reply.getHeader("x-idempotent-replay") && (typeof payload === "string" || payload == null)) {
      seen.set(k, { status: reply.statusCode, body: (payload as string | null) ?? "", at: now() });
      if (seen.size > MAX_KEYS) {
        for (const [key, v] of seen) if (now() - v.at > DAY || seen.size > MAX_KEYS) seen.delete(key);
      }
    }
    return payload;
  });
}
