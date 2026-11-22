import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { normalizeInviteCode } from "@fakkarni/shared";
import type { PrismaClient } from "../generated/prisma/client";
import { formatAmount } from "../daftar/rules";
import { respond, withPeople, type EntryWithPeople } from "../daftar/store";
import { esc, pickLang, renderShell, type Lang } from "../web/shell";

/**
 * The web page behind a Daftar link (https://…/d/CODE). The person who gets it on WhatsApp
 * confirms or questions the entry here, with nothing to install; the app is offered after.
 * Public: whoever holds the link sees the sender's name, the amount and the note.
 */
export interface DaftarPageOptions {
  prisma: PrismaClient;
  now?: () => Date;
  storeUrl?: string;
  appScheme?: string;
}

const COPY = {
  ar: {
    title: "الدفتر على زكي 🌟",
    description: "زكي بيسجّل اللي بينكم عشان محدش ينسى ومحدش يتحرج.",
    someone: "صاحبك",
    youOwe: (name: string) => `${name} سجّل إن عليك ليه`,
    owesYou: (name: string) => `${name} سجّل إن ليك عنده`,
    ask: "المبلغ ده مظبوط؟",
    confirm: "أيوه، مظبوط ✅",
    dispute: "لأ، مش مظبوط",
    recordOnly: "زكي بيسجّل بس. مفيش فلوس بتتحرك من هنا.",
    confirmedTitle: "اتسجلت عندكم انتو الاتنين ✅",
    disputedTitle: "تمام، بلّغناه إنها محتاجة مراجعة",
    disputedBody: "كلمة حلوة بينكم وتتظبط.",
    settledTitle: "دي اتقفلت خلاص 🎉",
    goneTitle: "اللينك ده مبقاش شغال",
    goneBody: "اطلب من اللي بعته لينك جديد.",
    pay: "ادفع بإنستاباي",
    payHint: (money: string) => `هيفتح إنستاباي. اكتب المبلغ هناك: ${money}`,
    install: "نزّل زكي وتابع كل اللي ليك وعليك",
    soon: "زكي نازل قريب على Google Play.",
    haveIt: "عندي زكي، افتحها جوّاه",
    ai: "زكي ذكاء اصطناعي، مش إنسان.",
  },
  en: {
    title: "The Daftar on Zaki 🌟",
    description: "Zaki keeps track of what's between you, so nobody forgets and nobody feels awkward.",
    someone: "Your friend",
    youOwe: (name: string) => `${name} noted that you owe them`,
    owesYou: (name: string) => `${name} noted that they owe you`,
    ask: "Is this amount right?",
    confirm: "Yes, that's right ✅",
    dispute: "No, that's not right",
    recordOnly: "Zaki only keeps the record. No money moves from here.",
    confirmedTitle: "Noted for both of you ✅",
    disputedTitle: "Okay, we've let them know it needs a look",
    disputedBody: "A quick, friendly word and it's sorted.",
    settledTitle: "This one is already settled 🎉",
    goneTitle: "This link no longer works",
    goneBody: "Ask the person who sent it for a new one.",
    pay: "Pay with InstaPay",
    payHint: (money: string) => `Opens InstaPay. Enter the amount there: ${money}`,
    install: "Get Zaki and keep track of everything",
    soon: "Zaki is coming to Google Play soon.",
    haveIt: "I have Zaki, open it there",
    ai: "Zaki is an AI, not a person.",
  },
} as const;

export function renderDaftarPage(e: EntryWithPeople | null, lang: Lang, opts: { storeUrl?: string; appScheme: string }): string {
  const t = COPY[lang];
  const meta = { title: t.title, description: t.description, footer: t.ai };
  if (!e || e.status === "cancelled") return renderShell(lang, meta, `<h1>${t.goneTitle}</h1><p>${t.goneBody}</p>`);

  const name = esc(e.creator.name ?? t.someone);
  const money = esc(formatAmount(Number(e.amount), e.currency, lang));
  // The visitor is the other person: when the creator is owed, the visitor owes.
  const visitorOwes = e.direction === "owed_to_me";
  const summary = `<p>${visitorOwes ? t.youOwe(name) : t.owesYou(name)}</p><p class="amount">${money}</p>${e.note ? `<p>${esc(e.note)}</p>` : ""}`;
  const getApp = `${opts.storeUrl ? `<a class="btn ghost" href="${esc(opts.storeUrl)}">${t.install}</a>` : `<p class="small">${t.soon}</p>`}
<a class="btn quiet" href="${opts.appScheme}://daftar/${esc(e.code)}">${t.haveIt}</a>`;

  if (e.status === "pending") {
    return renderShell(
      lang,
      meta,
      `${summary}<h1>${t.ask}</h1>
<form method="post" action="/d/${esc(e.code)}/confirm?lang=${lang}"><button class="btn" type="submit">${t.confirm}</button></form>
<form method="post" action="/d/${esc(e.code)}/dispute?lang=${lang}"><button class="btn quiet" type="submit">${t.dispute}</button></form>
<p class="small">${t.recordOnly}</p>`,
    );
  }
  if (e.status === "disputed") return renderShell(lang, meta, `<h1>${t.disputedTitle}</h1><p>${t.disputedBody}</p>${getApp}`);
  if (e.status === "settled") return renderShell(lang, meta, `<h1>${t.settledTitle}</h1>${getApp}`);
  const payLink = visitorOwes ? e.creator.instapayLink : null;
  const pay = payLink ? `<a class="btn pay" href="${esc(payLink)}">${t.pay}</a><p class="small">${t.payHint(money)}</p>` : "";
  return renderShell(lang, meta, `<h1>${t.confirmedTitle}</h1>${summary}${pay}${getApp}<p class="small">${t.recordOnly}</p>`);
}

export const daftarPageRoutes: FastifyPluginAsync<DaftarPageOptions> = async (app, opts) => {
  const { prisma } = opts;
  const now = opts.now ?? (() => new Date());
  const render = { storeUrl: opts.storeUrl, appScheme: opts.appScheme ?? "fakkarni" };
  const rateLimit = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } };

  // The two buttons are plain HTML forms with no fields; accept their empty bodies.
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string", bodyLimit: 1024 }, (_req, _body, done) => done(null, {}));

  const load = async (rawCode: string) => {
    const code = normalizeInviteCode(rawCode);
    return /^[A-Z0-9]{4,20}$/.test(code) ? prisma.daftarEntry.findUnique({ where: { code }, include: withPeople }) : null;
  };
  const send = (reply: FastifyReply, e: EntryWithPeople | null, lang: Lang) =>
    reply
      .code(!e || e.status === "cancelled" ? 404 : 200)
      .type("text/html; charset=utf-8")
      .header("cache-control", "no-store")
      .send(renderDaftarPage(e, lang, render));

  app.get<{ Params: { code: string }; Querystring: { lang?: string } }>("/d/:code", rateLimit, async (req, reply) => {
    return send(reply, await load(req.params.code), pickLang(req.query.lang, req.headers["accept-language"]));
  });

  // POST, so link previews and prefetchers can never answer for someone.
  for (const answer of ["confirm", "dispute"] as const) {
    app.post<{ Params: { code: string }; Querystring: { lang?: string } }>(`/d/:code/${answer}`, rateLimit, async (req, reply) => {
      const lang = pickLang(req.query.lang, req.headers["accept-language"]);
      const e = await load(req.params.code);
      if (!e || e.status === "cancelled") return send(reply, null, lang);
      if (e.status === "pending") await respond(prisma, e.id, answer, "web", now());
      // Back to the page (a refresh must not re-submit).
      return reply.redirect(`/d/${e.code}?lang=${lang}`, 303);
    });
  }
};
