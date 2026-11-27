import type { FastifyInstance, FastifyReply } from "fastify";
import { normalizeInviteCode } from "@fakkarni/shared";
import { Prisma } from "../generated/prisma/client";
import { newInviteCode } from "../circles/rules";
import { esc, type Lang } from "./shell";

/**
 * Building blocks for a no-app page (a link someone opens from WhatsApp, with nothing to
 * install). The recipe, used by /t/ (tasks) and /l/ (household lists), for any new one
 * (gam'eya turns, medicine doses):
 *  1. A `code` column (unique) on the row; make it with `withFreshCode`.
 *  2. A public plugin: GET /<x>/:code renders with `renderShell` (escape every user value with
 *     `esc`), answers through `sendPage` (no-store, 404 when gone).
 *  3. Every answer is a POST form (`acceptForms`), never a GET, so a link preview can never
 *     answer for anyone; then a 303 back to the page (`backTo`), so a refresh doesn't resend.
 *  4. Tell the app user in their chat (`postUpdate`, kind "update", a client_id per event) and
 *     by push (`pushNotices`). Words come from templates, never a model.
 *  5. Rate limits `PAGE_LIMIT` / `ANSWER_LIMIT`; `getAppBlock` at the end offers the app.
 */

export const PAGE_LIMIT = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } };
export const ANSWER_LIMIT = { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } };

/** A code from a URL, or null when it can't be one of ours. */
export function linkCode(raw: string): string | null {
  const code = normalizeInviteCode(raw);
  return /^[A-Z0-9]{4,20}$/.test(code) ? code : null;
}

/** Plain HTML forms post url-encoded bodies; read them into an object (scoped to the plugin). */
export function acceptForms(app: FastifyInstance, bodyLimit = 2048): void {
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string", bodyLimit }, (_req, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(String(body))));
  });
}

export const sendPage = (reply: FastifyReply, found: boolean, html: string) =>
  reply.code(found ? 200 : 404).type("text/html; charset=utf-8").header("cache-control", "no-store").send(html);

/** After a POST: back to the page with a GET, carrying a short notice key. */
export const backTo = (reply: FastifyReply, path: string, lang: Lang, notice?: string) =>
  reply.redirect(`${path}?lang=${lang}${notice ? `&ok=${encodeURIComponent(notice)}` : ""}`, 303);

/** Creates a row with a fresh unique code, trying again on the rare collision. */
export async function withFreshCode<T>(create: (code: string) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await create(newInviteCode());
    } catch (err) {
      if (attempt < 4 && err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
}

const GET_APP = {
  ar: { install: "نزّل زكي، صاحبك اللي بيفتكر عنك", soon: "زكي نازل قريب على Google Play.", haveIt: "عندي زكي، افتحها جوّاه" },
  en: { install: "Get Zaki, the friend who remembers for you", soon: "Zaki is coming to Google Play soon.", haveIt: "I have Zaki, open it there" },
} as const;

/** The quiet offer of the app at the end of a page. */
export function getAppBlock(lang: Lang, opts: { storeUrl?: string; deepLink?: string }): string {
  const t = GET_APP[lang];
  return `${opts.storeUrl ? `<a class="btn ghost" href="${esc(opts.storeUrl)}">${t.install}</a>` : `<p class="small">${t.soon}</p>`}${
    opts.deepLink ? `\n<a class="btn quiet" href="${esc(opts.deepLink)}">${t.haveIt}</a>` : ""
  }`;
}

/** A one-button POST form. */
export const postButton = (action: string, label: string, cls = "btn", fields: Record<string, string> = {}) =>
  `<form method="post" action="${esc(action)}">${Object.entries(fields)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join("")}<button class="${cls}" type="submit">${label}</button></form>`;
