import { createHash, randomBytes } from "node:crypto";
import type { FastifyPluginAsync, FastifyRequest, preHandlerAsyncHookHandler } from "fastify";
import { INSTALL_ID_HEADER } from "@fakkarni/shared";

/**
 * GET /bootstrap: every tab's data in one answer.
 *
 * The phone keeps a saved copy of each server-only screen and refreshes them all on start, on
 * return to the app and after a change. That was 17 or more requests (two at a time, so chat keeps
 * a free slot), each paying the phone's own round trip to the server. This route runs the very
 * same GETs inside the server, as the caller, and returns their answers together:
 *
 *   { "v": 1, "parts": { "/me": "<the JSON text GET /me answers>", "/circles": "...", ... } }
 *
 * Each part is the text of that route's own answer (a JSON string inside the JSON), so the phone
 * can compare it with its saved copy without parsing and skips whatever did not change. Only
 * answers with status 200 are included. The whole answer carries an ETag: when nothing changed
 * since the phone's last call it gets 304 and no body.
 *
 * Nothing here knows what a route returns: add a screen's GET to BASE (or CIRCLE) and the phone's
 * prefetch list (apps/mobile/src/lib/prefetch.ts) and it is covered.
 */

/** Marks the inner requests. Random per process, so it is never accepted from outside. */
export const INTERNAL_HEADER = "x-zaki-internal";
const internalToken = randomBytes(18).toString("hex");
/** True for a request this server made to itself (GET /bootstrap). They are not rate-limited twice. */
export const isInternal = (req: FastifyRequest): boolean => req.headers[INTERNAL_HEADER] === internalToken;

/** The same screens the phone preloads, in the same order. */
export const BOOTSTRAP_BASE = ["/circles", "/me", "/tasks", "/trackers", "/daftar", "/money", "/splits", "/memories", "/pocket-money"] as const;
export const BOOTSTRAP_CIRCLE = ["", "/feed", "/trackers"] as const;
/** Circles covered (the phone preloads the first 8 of its list). */
export const BOOTSTRAP_MAX_CIRCLES = 8;
/** Inner requests running at once: the database pool is small and chat must not wait behind this. */
const AT_ONCE = 5;

/** What the inner requests need to be the same caller on the same host. */
const FORWARDED = ["authorization", INSTALL_ID_HEADER, "x-message-kinds", "host", "x-forwarded-proto", "x-forwarded-host", "x-forwarded-for"] as const;

function limiter(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(work: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>((go) => waiting.push(go));
    active++;
    try {
      return await work();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}

const circleIds = (payload: string): string[] => {
  try {
    const list = (JSON.parse(payload) as { circles?: { id?: unknown }[] }).circles ?? [];
    return list.flatMap((c) => (typeof c.id === "string" && /^[\w-]{1,64}$/.test(c.id) ? [c.id] : [])).slice(0, BOOTSTRAP_MAX_CIRCLES);
  } catch {
    return [];
  }
};

/**
 * Calls a minute per caller. One call runs up to 33 inner GETs that the general limit does not
 * count, so it gets its own, tighter one: the phone asks once on start and return, and a few
 * seconds after a change (a handful a minute at most).
 */
export const BOOTSTRAP_PER_MINUTE = 30;

export const bootstrapRoutes: FastifyPluginAsync<{ authenticate: preHandlerAsyncHookHandler }> = async (app, opts) => {
  app.get("/bootstrap", { preHandler: opts.authenticate, config: { rateLimit: { max: BOOTSTRAP_PER_MINUTE, timeWindow: "1 minute" } } }, async (req, reply) => {
    const headers: Record<string, string> = { [INTERNAL_HEADER]: internalToken };
    for (const name of FORWARDED) {
      const value = req.headers[name];
      if (typeof value === "string") headers[name] = value;
    }
    const turn = limiter(AT_ONCE);
    const get = (path: string) =>
      turn(async () => {
        // Once the server is stopping (a deploy), Fastify refuses requests to itself: a part that
        // had not started by then is left out, as a part that failed is, and the phone keeps its
        // saved copy of that tab.
        const res = await app.inject({ method: "GET", url: path, headers }).catch(() => null);
        return res?.statusCode === 200 ? res.payload : null;
      });

    // The circle list decides which circles follow; they start as soon as it is in, while the
    // other tabs are still loading.
    const circles = get("/circles").then(async (payload) => {
      const paths = payload ? circleIds(payload).flatMap((id) => BOOTSTRAP_CIRCLE.map((tail) => `/circles/${id}${tail}`)) : [];
      return { payload, rest: await Promise.all(paths.map(async (path) => [path, await get(path)] as const)) };
    });
    const others = BOOTSTRAP_BASE.filter((p) => p !== "/circles");
    const [first, base] = await Promise.all([circles, Promise.all(others.map(async (path) => [path, await get(path)] as const))]);

    const parts: (readonly [string, string | null])[] = [["/circles", first.payload], ...base, ...first.rest];
    const body = `{"v":1,"parts":{${parts
      .filter((p): p is readonly [string, string] => p[1] !== null)
      .map(([path, json]) => `${JSON.stringify(path)}:${JSON.stringify(json)}`)
      .join(",")}}}`;

    const etag = `"${createHash("sha1").update(body).digest("base64url")}"`;
    reply.header("etag", etag).header("cache-control", "private, no-cache");
    if (req.headers["if-none-match"] === etag) return reply.code(304).send();
    return reply.type("application/json; charset=utf-8").send(body);
  });
};
