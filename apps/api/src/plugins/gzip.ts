import { promisify } from "node:util";
import { gzip } from "node:zlib";
import type { FastifyInstance } from "fastify";

const compress = promisify(gzip);

/** Below about one network packet there is nothing to win. */
export const GZIP_MIN_CHARS = 1400;

/**
 * Text answers (JSON, the public pages) go out gzipped when the caller accepts it. The phone's
 * HTTP client asks for gzip and unpacks it by itself. A list of chat messages or every tab's data
 * is 30 to 100 KB of JSON: unpacked it needs several round trips to arrive on a new connection,
 * packed it fits in the first one. Buffers (pictures) and streams are left alone.
 *
 * Register after every other onSend hook that reads the payload as text (plugins/idempotency.ts).
 */
export function registerGzip(app: FastifyInstance) {
  app.addHook("onSend", async (req, reply, payload) => {
    if (typeof payload !== "string" || payload.length < GZIP_MIN_CHARS) return payload;
    if (reply.hasHeader("content-encoding")) return payload;
    const accepts = req.headers["accept-encoding"];
    if (typeof accepts !== "string" || !/\bgzip\b/i.test(accepts)) return payload;
    const type = String(reply.getHeader("content-type") ?? "");
    if (!/json|text\/|javascript|xml/i.test(type)) return payload;
    const packed = await compress(payload);
    reply.header("content-encoding", "gzip").header("vary", "accept-encoding");
    reply.removeHeader("content-length");
    return packed;
  });
}
