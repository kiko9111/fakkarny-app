import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { normalizeInviteCode } from "@fakkarni/shared";
import type { PrismaClient } from "../generated/prisma/client";
import { cardSvg, renderPng, type CardContent, type CardLang } from "../cards/render";
import { toWireSplit } from "../split/store";
import { pickLang } from "../web/shell";
import { baseUrl } from "./circles";

/**
 * Public share cards (PNG, 1080x1920) for WhatsApp Status and Stories. They draw only what the
 * sharer chose to show: a streak number, or a split's title and total (already on its public page).
 */
export interface CardRoutesOptions {
  prisma: PrismaClient;
  publicUrl?: string;
}

const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const short = (url: string) => url.replace(/^https?:\/\//, "");

export function streakCard(days: number, lang: CardLang, link: string): CardContent {
  return lang === "ar"
    ? { eyebrow: "مع زكي", big: String(days), line: days <= 10 ? "أيام ورا بعض" : "يوم ورا بعض", footer: "زكي بيفتكر عنك كل حاجة", link: short(link) }
    : { eyebrow: "With Zaki", big: String(days), line: "days in a row", footer: "Zaki remembers everything for you", link: short(link) };
}

export function splitCard(title: string, total: number, people: number, lang: CardLang, link: string): CardContent {
  return lang === "ar"
    ? { eyebrow: title || "قسمنا الحساب", big: num(total), line: `جنيه على ${people}، كل واحد دفع اللي طلبه`, footer: "اتقسم بزكي", link: short(link) }
    : { eyebrow: title || "We split the bill", big: num(total), line: `EGP for ${people}, everyone paid for their own`, footer: "Split with Zaki", link: short(link) };
}

export const cardRoutes: FastifyPluginAsync<CardRoutesOptions> = async (app, opts) => {
  const rateLimit = { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } };
  const png = (reply: FastifyReply, content: CardContent, lang: CardLang) =>
    reply.type("image/png").header("cache-control", "public, max-age=3600").send(renderPng(cardSvg(content, lang)));

  /** /cards/streak/12.png?lang=ar&code=ABC1234 (the sharer's own invite code, for the link). */
  app.get<{ Params: { days: string }; Querystring: { lang?: string; code?: string } }>("/cards/streak/:days", rateLimit, async (req, reply) => {
    const m = /^(\d{1,4})\.png$/.exec(req.params.days);
    const days = m ? Number(m[1]) : NaN;
    if (!Number.isInteger(days) || days < 2 || days > 3650) return reply.code(404).send({ error: "not_found" });
    const code = req.query.code ? normalizeInviteCode(req.query.code) : "";
    const base = baseUrl(req, opts.publicUrl);
    const link = /^[A-Z0-9]{4,16}$/.test(code) ? `${base}/r/${code}` : base;
    const lang = pickLang(req.query.lang, req.headers["accept-language"]);
    return png(reply, streakCard(days, lang, link), lang);
  });

  /** The card for a split's public page (its og:image too). */
  app.get<{ Params: { code: string }; Querystring: { lang?: string } }>("/s/:code/card.png", rateLimit, async (req, reply) => {
    const code = normalizeInviteCode(req.params.code);
    const row = /^[A-Z0-9]{4,20}$/.test(code) ? await opts.prisma.split.findUnique({ where: { code } }) : null;
    if (!row) return reply.code(404).send({ error: "not_found" });
    const split = toWireSplit(row, baseUrl(req, opts.publicUrl));
    const lang = pickLang(req.query.lang, req.headers["accept-language"]);
    return png(reply, splitCard(split.title, split.total, split.people.length, lang, split.url), lang);
  });
};
