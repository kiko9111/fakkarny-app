import type { FastifyPluginAsync } from "fastify";
import { normalizeInviteCode } from "@fakkarni/shared";
import type { PrismaClient } from "../generated/prisma/client";
import { MAX_CIRCLE_MEMBERS } from "../circles/rules";
import { esc, pickLang, renderShell, type Lang } from "../web/shell";

/**
 * The web page behind an invite link (https://…/i/CODE). The person who gets the link on
 * WhatsApp confirms here first, with nothing to install, and is offered the app only after.
 * Public and unauthenticated: it shows the inviter's name and the circle's name, nothing else.
 */
export interface InvitePageOptions {
  prisma: PrismaClient;
  now?: () => Date;
  /** Google Play (or web app) link for the "get Zaki" button (ANDROID_STORE_URL). */
  storeUrl?: string;
  /** App URL scheme for "I already have Zaki" (default "fakkarni"). */
  appScheme?: string;
}

type View = { kind: "invite" | "confirmed"; inviter: string | null; circle: string; family: boolean; code: string } | { kind: "gone" };

const COPY = {
  ar: {
    pageTitle: "دعوة على زكي 🌟",
    ogDescription: "زكي بيفتكر عنك وعن اللي بتحبهم: مهام، فلوس، تذكيرات.",
    hello: (inviter: string | null, circle: string) => `${inviter ? esc(inviter) : "حد بيحبك"} عازمك على «${esc(circle)}»`,
    whatFamily: "في دايرة العيلة بتتشاركوا طلبات البيت والمهام والاطمئنان على بعض.",
    whatFriends: "في دايرة الصحاب بتتابعوا المهام والفلوس اللي بينكم من غير إحراج.",
    points: ["زكي بيفكّر كل واحد باللي عليه، بلُطف", "كل حاجة متسجلة ومحدش بينسى", "ببلاش، ومن غير إعلانات"],
    confirm: "أيوه، أنا معاكم ✋",
    noInstall: "مش محتاج تنزّل حاجة عشان تأكّد.",
    confirmedTitle: "حلو أوي! 🎉",
    confirmedBody: (circle: string) => `فاضل خطوة واحدة عشان تدخل «${esc(circle)}»: نزّل زكي وافتح الدعوة من جوّاه.`,
    install: "نزّل زكي",
    soon: "زكي نازل قريب على Google Play. احتفظ بالكود ده:",
    haveIt: "عندي زكي، افتح الدعوة",
    codeLabel: "أو اكتب الكود ده جوه التطبيق",
    goneTitle: "الدعوة دي مبقتش شغالة",
    goneBody: "اطلب من اللي بعتهالك يبعتلك لينك جديد.",
    ai: "زكي ذكاء اصطناعي، مش إنسان.",
  },
  en: {
    pageTitle: "An invite on Zaki 🌟",
    ogDescription: "Zaki remembers for you and the people you love: tasks, money, reminders.",
    hello: (inviter: string | null, circle: string) => `${inviter ? esc(inviter) : "Someone who cares about you"} invited you to “${esc(circle)}”`,
    whatFamily: "In a family circle you share errands, tasks and check-ins.",
    whatFriends: "In a friends circle you keep track of tasks and who owes what, with no awkwardness.",
    points: ["Zaki gently reminds everyone of their part", "Everything is written down, nobody forgets", "Free, with no ads"],
    confirm: "Yes, I'm in ✋",
    noInstall: "Nothing to install to confirm.",
    confirmedTitle: "Lovely! 🎉",
    confirmedBody: (circle: string) => `One step left to join “${esc(circle)}”: get Zaki and open the invite inside it.`,
    install: "Get Zaki",
    soon: "Zaki is coming to Google Play soon. Keep this code:",
    haveIt: "I have Zaki, open the invite",
    codeLabel: "Or type this code in the app",
    goneTitle: "This invite no longer works",
    goneBody: "Ask the person who sent it for a new link.",
    ai: "Zaki is an AI, not a person.",
  },
} as const;

export function renderInvitePage(view: View, lang: Lang, opts: { storeUrl?: string; appScheme: string }): string {
  const t = COPY[lang];
  let body: string;
  if (view.kind === "gone") {
    body = `<h1>${t.goneTitle}</h1><p>${t.goneBody}</p>`;
  } else if (view.kind === "invite") {
    body = `<h1>${t.hello(view.inviter, view.circle)}</h1>
<p>${view.family ? t.whatFamily : t.whatFriends}</p>
<ul>${t.points.map((p) => `<li>${p}</li>`).join("")}</ul>
<a class="btn" href="/i/${esc(view.code)}/confirm?lang=${lang}">${t.confirm}</a>
<p class="small">${t.noInstall}</p>`;
  } else {
    const deepLink = `${opts.appScheme}://invite/${esc(view.code)}`;
    body = `<h1>${t.confirmedTitle}</h1>
<p>${t.confirmedBody(view.circle)}</p>
${opts.storeUrl ? `<a class="btn" href="${esc(opts.storeUrl)}">${t.install}</a>` : `<p>${t.soon}</p>`}
<a class="btn ghost" href="${deepLink}">${t.haveIt}</a>
<p class="small">${t.codeLabel}</p>
<p class="code" dir="ltr">${esc(view.code)}</p>`;
  }
  return renderShell(lang, { title: t.pageTitle, description: t.ogDescription, footer: t.ai }, body);
}

export const invitePageRoutes: FastifyPluginAsync<InvitePageOptions> = async (app, opts) => {
  const { prisma } = opts;
  const now = opts.now ?? (() => new Date());
  const render = { storeUrl: opts.storeUrl, appScheme: opts.appScheme ?? "fakkarni" };

  async function load(rawCode: string): Promise<View> {
    const code = normalizeInviteCode(rawCode);
    if (!/^[A-Z0-9]{4,20}$/.test(code)) return { kind: "gone" };
    const invite = await prisma.invite.findUnique({
      where: { code },
      include: { circle: { include: { _count: { select: { members: true } } } }, inviter: { select: { name: true } } },
    });
    if (!invite || invite.revokedAt || invite.expiresAt <= now() || invite.circle._count.members >= MAX_CIRCLE_MEMBERS) return { kind: "gone" };
    return { kind: "invite", inviter: invite.inviter.name, circle: invite.circle.name, family: invite.circle.kind === "family", code };
  }

  const send = (reply: import("fastify").FastifyReply, view: View, lang: Lang) =>
    reply
      .code(view.kind === "gone" ? 404 : 200)
      .type("text/html; charset=utf-8")
      .header("cache-control", "no-store")
      .send(renderInvitePage(view, lang, render));

  const rateLimit = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } };

  app.get<{ Params: { code: string }; Querystring: { lang?: string } }>("/i/:code", rateLimit, async (req, reply) => {
    return send(reply, await load(req.params.code), pickLang(req.query.lang, req.headers["accept-language"]));
  });

  /** The "Yes, I'm in" tap: counted for the funnel, then the install step is shown. */
  app.get<{ Params: { code: string }; Querystring: { lang?: string } }>("/i/:code/confirm", rateLimit, async (req, reply) => {
    const view = await load(req.params.code);
    const lang = pickLang(req.query.lang, req.headers["accept-language"]);
    if (view.kind === "gone") return send(reply, view, lang);
    await prisma.invite.update({ where: { code: view.code }, data: { webConfirms: { increment: 1 } } });
    return send(reply, { ...view, kind: "confirmed" }, lang);
  });
};
