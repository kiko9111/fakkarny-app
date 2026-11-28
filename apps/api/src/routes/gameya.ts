import type { FastifyPluginAsync, FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from "fastify";
import { z } from "zod";
import {
  CreateGameyaRequest,
  GameyaPaidRequest,
  GameyaReceivedRequest,
  GAMEYA_NUDGE_HOURS,
  MAX_GAMEYAS_PER_OWNER,
  monthOfRound,
  normalizeInviteCode,
  phaseOf,
  roundState,
  shownRound,
  UpdateGameyaRequest,
  type Gameya,
  type GameyaRemindResponse,
  type GameyaResponse,
} from "@fakkarni/shared";
import { Prisma, type PrismaClient } from "../generated/prisma/client";
import { newInviteCode } from "../circles/rules";
import { formatAmount, type Lang } from "../daftar/rules";
import { inBackground } from "../lib/background";
import { pushNotices, type Notice } from "../proactive/notify";
import type { PushSender } from "../proactive/push";
import { cleanMembers, createBook, memberRows, readBook, setPaid, setReceived, tellJoined, toWireGameya, visibleGameyas, withBook, type BookRow } from "../gameya/store";
import { monthName, nudgeLine, remindText, shareText } from "../gameya/rules";
import { esc, pickLang, renderShell } from "../web/shell";
import { baseUrl } from "./circles";

/**
 * The gam'eya book: GET /gameyas (every gam'eya the caller organizes or is in), make, change,
 * delete, tick payments, mark the pot handed over, and "remind the ones who haven't paid". The
 * public page /g/:code shows the turns to anyone with the link. Free; no AI call. Records only.
 */
export interface GameyaRoutesOptions {
  prisma: PrismaClient;
  authenticate: preHandlerAsyncHookHandler;
  publicUrl?: string;
  now?: () => Date;
  push?: PushSender;
}

const IdParam = z.object({ id: z.uuid() });
const langOf = (u: { language: string }): Lang => (u.language === "en" ? "en" : "ar");

export const gameyaRoutes: FastifyPluginAsync<GameyaRoutesOptions> = async (app, opts) => {
  const { prisma } = opts;
  const now = opts.now ?? (() => new Date());
  app.addHook("preHandler", opts.authenticate);
  const base = (req: FastifyRequest) => baseUrl(req, opts.publicUrl);
  const tell = (notices: Notice[]) => void pushNotices(prisma, opts.push, notices, app.log);
  const respond = (req: FastifyRequest, row: BookRow): GameyaResponse => {
    const gameya = toWireGameya(row, base(req), req.user.id, now());
    return { gameya, share_text: shareText(langOf(req.user), gameya) };
  };
  const visible = async (req: FastifyRequest) => {
    const p = IdParam.safeParse(req.params);
    return p.success ? readBook(prisma, p.data.id, req.user.id) : null;
  };

  app.get("/gameyas", async (req) => {
    const rows = await prisma.gameya.findMany({ where: visibleGameyas(req.user.id), include: withBook, orderBy: { createdAt: "desc" }, take: 40 });
    const at = now();
    return { gameyas: rows.map((r) => toWireGameya(r, base(req), req.user.id, at)) };
  });

  app.get("/gameyas/:id", async (req, reply) => {
    const row = await visible(req);
    return row ? respond(req, row) : reply.code(404).send({ error: "not_found" });
  });

  app.post("/gameyas", async (req, reply) => {
    const body = CreateGameyaRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    if (body.data.id) {
      const known = await prisma.gameya.findUnique({ where: { id: body.data.id }, select: { ownerId: true } });
      if (known) {
        const row = known.ownerId === req.user.id ? await readBook(prisma, body.data.id, req.user.id) : null;
        return row ? reply.code(200).send(respond(req, row)) : reply.code(422).send({ error: "taken" });
      }
    }
    const members = await cleanMembers(prisma, req.user.id, body.data.circle_id, body.data.members);
    if (!members) return reply.code(422).send({ error: "invalid_circle" });
    if ((await prisma.gameya.count({ where: { ownerId: req.user.id } })) >= MAX_GAMEYAS_PER_OWNER) return reply.code(422).send({ error: "too_many" });
    const at = now();
    for (let attempt = 0; ; attempt++) {
      try {
        const row = await createBook(prisma, req.user.id, body.data, members, newInviteCode(), at);
        tell(await tellJoined(prisma, row, at));
        inBackground(prisma.event.create({ data: { userId: req.user.id, name: "gameya_created", propsJson: { members: members.length, linked: members.filter((m) => m.user_id).length, circle: Boolean(body.data.circle_id) } } }));
        return reply.code(201).send(respond(req, row));
      } catch (err) {
        if (attempt < 4 && err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && !body.data.id) continue;
        throw err;
      }
    }
  });

  /** The organizer changes it. Amount, start month and members only before the first payment. */
  app.patch("/gameyas/:id", async (req, reply) => {
    const row = await visible(req);
    if (!row || row.ownerId !== req.user.id) return reply.code(404).send({ error: "not_found" });
    const body = UpdateGameyaRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    const { name, pay_day, amount, start_month, members } = body.data;
    const locked = amount !== undefined || start_month !== undefined || members !== undefined;
    if (locked && row.payments.length) return reply.code(422).send({ error: "started" });
    const clean = members ? await cleanMembers(prisma, req.user.id, row.circleId, members) : null;
    if (members && !clean) return reply.code(422).send({ error: "invalid_circle" });
    // Ids from another gam'eya are dropped (made new).
    const own = new Set(row.members.map((m) => m.id));
    const list = clean?.map((m) => (m.id && own.has(m.id) ? m : { name: m.name, user_id: m.user_id }));
    const before = new Set(row.members.map((m) => m.userId).filter(Boolean));
    await prisma.$transaction(async (tx) => {
      await tx.gameya.update({ where: { id: row.id }, data: { name, payDay: pay_day, amount, startMonth: start_month, updatedAt: now() } });
      if (list) {
        await tx.gameyaMember.deleteMany({ where: { gameyaId: row.id } });
        await tx.gameyaMember.createMany({ data: memberRows(row.id, list) });
      }
    });
    const fresh = (await readBook(prisma, row.id, req.user.id))!;
    // Zaki members added by this change hear about it (the others were told once already).
    const added = fresh.members.flatMap((m) => (m.userId && !before.has(m.userId) ? [m.userId] : []));
    if (added.length) tell(await tellJoined(prisma, fresh, now(), new Set(added)));
    return respond(req, fresh);
  });

  app.delete("/gameyas/:id", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: "not_found" });
    await prisma.gameya.deleteMany({ where: { id: p.data.id, ownerId: req.user.id } });
    return reply.code(204).send();
  });

  /** The organizer ticks anyone; a member ticks (or unticks) only their own row. */
  app.post("/gameyas/:id/paid", async (req, reply) => {
    const body = GameyaPaidRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    const row = await visible(req);
    if (!row) return reply.code(404).send({ error: "not_found" });
    const member = row.members.find((m) => m.id === body.data.member_id);
    if (!member || body.data.round > row.members.length) return reply.code(422).send({ error: "invalid_body" });
    const owner = row.ownerId === req.user.id;
    if (!owner && member.userId !== req.user.id) return reply.code(403).send({ error: "not_allowed" });
    const done = await setPaid(prisma, row, member.id, body.data.round, body.data.paid, owner ? "owner" : "member", now());
    if (done) tell(done.notices);
    return respond(req, done?.row ?? row);
  });

  /** The pot of a round handed over: the organizer, or the member receiving it. */
  app.post("/gameyas/:id/received", async (req, reply) => {
    const body = GameyaReceivedRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    const row = await visible(req);
    if (!row) return reply.code(404).send({ error: "not_found" });
    const receiver = row.members.find((m) => m.turn === body.data.round);
    if (!receiver) return reply.code(422).send({ error: "invalid_body" });
    if (row.ownerId !== req.user.id && receiver.userId !== req.user.id) return reply.code(403).send({ error: "not_allowed" });
    const done = await setReceived(prisma, row, body.data.round, body.data.received, req.user.id, now());
    if (done) tell(done.notices);
    return respond(req, done?.row ?? row);
  });

  /**
   * The organizer reminds the ones who haven't paid this round: Zaki members in their chat (once
   * per GAMEYA_NUDGE_HOURS each), and a WhatsApp text for everyone else.
   */
  app.post("/gameyas/:id/remind", async (req, reply) => {
    const row = await visible(req);
    if (!row || row.ownerId !== req.user.id) return reply.code(404).send({ error: "not_found" });
    const at = now();
    const g = toWireGameya(row, base(req), req.user.id, at);
    const round = shownRound(g);
    const month = monthOfRound(g.start_month, round);
    const unpaid = roundState(g, round).unpaid.filter((m) => m.user_id && m.user_id !== req.user.id);
    const bucket = Math.floor(at.getTime() / (GAMEYA_NUDGE_HOURS * 3600_000));
    const users = unpaid.length ? await prisma.user.findMany({ where: { id: { in: unpaid.map((m) => m.user_id!) } }, select: { id: true, language: true } }) : [];
    const notices: Notice[] = [];
    for (const u of users) {
      const text = nudgeLine(langOf(u), g, month, row.owner.name);
      const made = await prisma.message.createMany({ data: [{ userId: u.id, role: "friend", kind: "update", text, clientId: `gameya:${row.id}:${round}:nudge:${u.id}:${bucket}`, createdAt: at }], skipDuplicates: true });
      if (made.count) notices.push({ userId: u.id, text });
    }
    tell(notices);
    const res: GameyaRemindResponse = { reminded: notices.length, share_text: remindText(langOf(req.user), g, round, month) };
    return res;
  });
};

/* ---------- The public page: GET /g/:code ---------- */

const COPY = {
  ar: {
    title: "جمعية على زكي 🤝",
    description: "الأدوار، مين دفع الشهر ده، والقبض لمين: دايماً محدّث.",
    gone: "الجمعية دي مش موجودة.",
    monthly: (m: string, d: number) => `${m} في الشهر · القسط يوم ${d}`,
    pot: (m: string) => `القبض ${m}`,
    by: (n: string) => `بتنظيم ${esc(n)}`,
    now: (month: string, r: number, n: number) => `${month} · الدور ${r} من ${n}`,
    receiver: (n: string) => `القبض الشهر ده لـ <strong>${esc(n)}</strong>`,
    paidCount: (a: number, b: number) => `دفع ${a} من ${b}`,
    turns: "الأدوار",
    received: "قبض ✓",
    thisMonth: "الشهر ده",
    paidMark: "دفع ✓",
    before: (m: string) => `بتبدأ ${m}`,
    over: "الجمعية خلصت 🎉",
    paidTitle: "دفعت قسط الشهر ده؟",
    paidBody: (n: string) => `اختار اسمك و${esc(n)} هيعرف من زكي.`,
    paidBtn: "دفعت ✓",
    paidOk: "اتسجّل إنك دفعت 🎉 شكراً!",
    paidAlready: "متسجّل إنه اتدفع خلاص.",
    bad: "اختار اسمك.",
    pay: (n: string) => `ادفع لـ${esc(n)} بـ InstaPay`,
    payHint: "هيفتح InstaPay، واكتب المبلغ هناك.",
    recordOnly: "زكي بيسجّل بس، ومش بيمسك أو يحوّل فلوس.",
    cta: "نظّم جمعيتك الجاية بزكي",
    ctaBody: "زكي بيفكّر الكل قبل ميعاد القسط، وبيقولك القبض لمين، وكمان بيفتكرلك كل حاجة تانية في يومك.",
    install: "نزّل زكي ببلاش",
    soon: "زكي نازل قريب على Google Play.",
    ai: "زكي ذكاء اصطناعي، مش إنسان.",
  },
  en: {
    title: "A gam'eya on Zaki 🤝",
    description: "The turns, who paid this month and whose pot it is: always up to date.",
    gone: "This gam'eya doesn't exist.",
    monthly: (m: string, d: number) => `${m} a month · pay day the ${d}th`,
    pot: (m: string) => `Pot ${m}`,
    by: (n: string) => `Kept by ${esc(n)}`,
    now: (month: string, r: number, n: number) => `${month} · turn ${r} of ${n}`,
    receiver: (n: string) => `This month's pot goes to <strong>${esc(n)}</strong>`,
    paidCount: (a: number, b: number) => `${a} of ${b} paid`,
    turns: "Turns",
    received: "received ✓",
    thisMonth: "this month",
    paidMark: "paid ✓",
    before: (m: string) => `Starts ${m}`,
    over: "This gam'eya is complete 🎉",
    paidTitle: "Paid this month?",
    paidBody: (n: string) => `Pick your name and Zaki tells ${esc(n)}.`,
    paidBtn: "I paid ✓",
    paidOk: "Marked as paid 🎉 Thank you!",
    paidAlready: "That's already marked paid.",
    bad: "Pick your name.",
    pay: (n: string) => `Pay ${esc(n)} with InstaPay`,
    payHint: "Opens InstaPay. Type the amount there.",
    recordOnly: "Zaki only keeps the record; it never holds or moves money.",
    cta: "Run your next gam'eya with Zaki",
    ctaBody: "Zaki reminds everyone before pay day, tells you whose pot it is, and remembers everything else in your day too.",
    install: "Get Zaki, free",
    soon: "Zaki is coming to Google Play soon.",
    ai: "Zaki is an AI, not a person.",
  },
} as const;

export function renderGameyaPage(g: Gameya | null, lang: Lang, opts: { storeUrl?: string; notice?: string }): string {
  const t = COPY[lang];
  const meta = { title: t.title, description: t.description, footer: t.ai };
  if (!g) return renderShell(lang, meta, `<p>${t.gone}</p>`);
  const money = (n: number) => esc(formatAmount(n, g.currency, lang));
  const phase = phaseOf(g);
  const round = shownRound(g);
  const s = roundState(g, round);
  const paid = new Set(s.paid.map((m) => m.id));
  const owner = g.owner_name ?? (lang === "en" ? "the organizer" : "المنظّم");
  const head =
    phase === "before"
      ? `<p>${t.before(esc(monthName(g.start_month, lang)))}</p>`
      : phase === "over"
        ? `<p>${t.over}</p>`
        : `<p>${t.now(esc(monthName(monthOfRound(g.start_month, round), lang)), round, g.months)}</p><p>${s.receiver ? t.receiver(s.receiver.name) : ""}</p><p>${t.paidCount(s.paid.length, g.members.length)}</p>`;
  const rows = g.members
    .map((m) => {
      const marks = [m.received ? t.received : null, phase === "running" && m.turn === round ? t.thisMonth : null, phase === "running" && paid.has(m.id) ? t.paidMark : null].filter(Boolean).join(" · ");
      return `<li><strong>${m.turn}. ${esc(m.name)}</strong>: ${esc(monthName(m.month, lang))}${marks ? ` <span class="small">${marks}</span>` : ""}</li>`;
    })
    .join("");
  const unpaid = phase === "running" ? s.unpaid : [];
  const pay = unpaid.length && g.instapay ? `<a class="btn pay" href="${esc(g.instapay)}">${t.pay(owner)}</a><p class="small">${t.payHint}</p>` : "";
  const form = unpaid.length
    ? `<h2>${t.paidTitle}</h2><p class="small">${t.paidBody(owner)}</p>
<form method="post" action="/g/${esc(g.code)}/paid?lang=${lang}">
<p><select name="who">${unpaid.map((m) => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join("")}</select></p>
<button class="btn quiet" type="submit">${t.paidBtn}</button>
</form>`
    : "";
  const body = `${opts.notice ? `<p><strong>${esc(opts.notice)}</strong></p>` : ""}<h1>${esc(g.name)}</h1>
<p>${t.monthly(money(g.amount), g.pay_day)} · ${t.pot(money(g.pot))}</p>
<p class="small">${t.by(owner)}</p>
${head}
${pay}
${form}
<h2>${t.turns}</h2>
<ul>${rows}</ul>
<p class="small">${t.recordOnly}</p>
<h2>${t.cta}</h2>
<p>${t.ctaBody}</p>
${opts.storeUrl ? `<a class="btn" href="${esc(opts.storeUrl)}">${t.install}</a>` : `<p class="small">${t.soon}</p>`}`;
  return renderShell(lang, meta, body);
}

export const gameyaPageRoutes: FastifyPluginAsync<{ prisma: PrismaClient; publicUrl?: string; storeUrl?: string; now?: () => Date; push?: PushSender }> = async (app, opts) => {
  const { prisma } = opts;
  const now = opts.now ?? (() => new Date());
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string", bodyLimit: 2048 }, (_req, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(String(body))));
  });
  const load = async (raw: string) => {
    const code = normalizeInviteCode(raw);
    return /^[A-Z0-9]{4,20}$/.test(code) ? prisma.gameya.findUnique({ where: { code }, include: withBook }) : null;
  };
  const send = (reply: FastifyReply, req: FastifyRequest, row: BookRow | null, lang: Lang, notice?: string) =>
    reply
      .code(row ? 200 : 404)
      .type("text/html; charset=utf-8")
      .header("cache-control", "no-store")
      .send(renderGameyaPage(row ? toWireGameya(row, baseUrl(req, opts.publicUrl), null, now()) : null, lang, { storeUrl: opts.storeUrl, notice }));

  app.get<{ Params: { code: string }; Querystring: { lang?: string } }>("/g/:code", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const lang = pickLang(req.query.lang, req.headers["accept-language"]);
    const row = await load(req.params.code);
    if (row) inBackground(prisma.gameya.update({ where: { id: row.id }, data: { webViews: { increment: 1 } } }));
    return send(reply, req, row, lang);
  });

  /**
   * Someone says they paid this round (a POST form, so a link preview can never answer). The
   * organizer hears it in their chat and can untick it: anyone with the link can tap it.
   */
  app.post<{ Params: { code: string }; Querystring: { lang?: string } }>("/g/:code/paid", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const lang = pickLang(req.query.lang, req.headers["accept-language"]);
    const t = COPY[lang];
    const row = await load(req.params.code);
    if (!row) return send(reply, req, null, lang);
    const g = toWireGameya(row, "", null, now());
    const who = z.object({ who: z.uuid() }).safeParse(req.body).data?.who;
    if (!who || phaseOf(g) !== "running" || !row.members.some((m) => m.id === who)) return send(reply, req, row, lang, t.bad);
    const done = await setPaid(prisma, row, who, g.round, true, "web", now());
    if (!done) return send(reply, req, row, lang, t.paidAlready);
    void pushNotices(prisma, opts.push, done.notices, app.log);
    return send(reply, req, done.row, lang, t.paidOk);
  });
};

