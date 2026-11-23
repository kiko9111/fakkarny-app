import type { FastifyPluginAsync } from "fastify";
import type { PrismaClient } from "../generated/prisma/client";
import { normalizeReferralCode, REFERRAL_WELCOME_DAYS } from "../billing/referral";
import { esc, pickLang, renderShell, type Lang } from "../web/shell";

/**
 * The web page behind a personal invite link (https://…/r/CODE), sent from the inviter's own
 * WhatsApp. Public: it shows the inviter's first name and nothing else. Both people get Pro
 * days once the friend signs in and opens the link in the app (POST /referrals/claim).
 */
export interface ReferralPageOptions {
  prisma: PrismaClient;
  storeUrl?: string;
  appScheme?: string;
}

const COPY = {
  ar: {
    pageTitle: "تعالى جرّب زكي 🌟",
    ogDescription: "زكي صاحبك اللي بيفتكر عنك: تذكيرات، مهام للعيلة، فلوس، وتقسيم الحساب.",
    hello: (name: string | null) => `${name ? esc(name) : "صاحبك"} عازمك على زكي 🌟`,
    gift: (days: number) => `انت وهو تاخدوا ${days} أيام زكي برو هدية 🎁`,
    points: ["قول لزكي أي حاجة بكلامك العادي، وهو يفتكر ويفكّرك", "مهام البيت والعيلة من غير زن", "الفلوس اللي ليك وعليك متسجلة"],
    install: "نزّل زكي",
    soon: "زكي نازل قريب على Google Play. احتفظ بالكود ده:",
    haveIt: "عندي زكي، افتح الهدية",
    codeLabel: "أو اكتب الكود ده جوه التطبيق (أنا ← معايا كود دعوة)",
    gone: "اللينك ده مش شغال. اطلب من صاحبك يبعتلك لينك جديد.",
    ai: "زكي ذكاء اصطناعي، مش إنسان.",
  },
  en: {
    pageTitle: "Come try Zaki 🌟",
    ogDescription: "Zaki is the friend who remembers for you: reminders, family tasks, money, splitting the bill.",
    hello: (name: string | null) => `${name ? esc(name) : "Your friend"} invited you to Zaki 🌟`,
    gift: (days: number) => `You both get ${days} days of Zaki Pro as a gift 🎁`,
    points: ["Tell Zaki anything in your own words; he remembers and reminds you", "Family errands without the nagging", "Who owes what, written down"],
    install: "Get Zaki",
    soon: "Zaki is coming to Google Play soon. Keep this code:",
    haveIt: "I have Zaki, open the gift",
    codeLabel: "Or type this code in the app (Me → I have an invite code)",
    gone: "This link doesn't work. Ask your friend for a new one.",
    ai: "Zaki is an AI, not a person.",
  },
} as const;

export function renderReferralPage(view: { name: string | null; code: string } | null, lang: Lang, opts: { storeUrl?: string; appScheme: string }): string {
  const t = COPY[lang];
  const body = !view
    ? `<p>${t.gone}</p>`
    : `<h1>${t.hello(view.name)}</h1>
<p><strong>${t.gift(REFERRAL_WELCOME_DAYS)}</strong></p>
<ul>${t.points.map((p) => `<li>${p}</li>`).join("")}</ul>
${opts.storeUrl ? `<a class="btn" href="${esc(opts.storeUrl)}">${t.install}</a>` : `<p>${t.soon}</p>`}
<a class="btn ghost" href="${opts.appScheme}://ref/${esc(view.code)}">${t.haveIt}</a>
<p class="small">${t.codeLabel}</p>
<p class="code" dir="ltr">${esc(view.code)}</p>`;
  return renderShell(lang, { title: t.pageTitle, description: t.ogDescription, footer: t.ai }, body);
}

/** First word of a display name: a public page never shows more than that. */
const firstName = (name: string | null) => (name ? name.trim().split(/\s+/)[0]!.slice(0, 30) : null);

export const referralPageRoutes: FastifyPluginAsync<ReferralPageOptions> = async (app, opts) => {
  const render = { storeUrl: opts.storeUrl, appScheme: opts.appScheme ?? "fakkarni" };
  app.get<{ Params: { code: string }; Querystring: { lang?: string } }>(
    "/r/:code",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const lang = pickLang(req.query.lang, req.headers["accept-language"]);
      const code = normalizeReferralCode(req.params.code);
      const user = /^[A-Z0-9]{4,16}$/.test(code) ? await opts.prisma.user.findUnique({ where: { referralCode: code }, select: { name: true } }) : null;
      const view = user ? { name: firstName(user.name), code } : null;
      return reply.code(view ? 200 : 404).type("text/html; charset=utf-8").header("cache-control", "no-store").send(renderReferralPage(view, lang, render));
    },
  );
};
