import type { FastifyPluginAsync, FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from "fastify";
import { z } from "zod";
import { currencyOf, MarkSplitPaidRequest, MAX_SPLIT_ITEMS, MAX_SPLIT_PEOPLE, normalizeInviteCode, SplitInput, UpdateSplitRequest, type ListSplitsResponse, type Split, type SplitResponse } from "@fakkarni/shared";
import { Prisma, type PrismaClient, type Split as SplitRow } from "../generated/prisma/client";
import { newInviteCode } from "../circles/rules";
import { formatAmount, type Lang } from "../daftar/rules";
import { postUpdate } from "../daftar/store";
import { splitShareText } from "../split/rules";
import { computeSplit, inputOf, paidNamesOf, toWireSplit } from "../split/store";
import { groupOf, instapayFor, markPaid, payerIsCreator, tellMembers } from "../split/group";
import { pushNotices, type Notice } from "../proactive/notify";
import type { PushSender } from "../proactive/push";
import { esc, pickLang, renderShell } from "../web/shell";
import { baseUrl } from "./circles";

/**
 * Split the check (packages/shared/src/split.ts). The creator's own record; everyone at the
 * table opens the public page /s/:code, sees their share and can add what they ordered with
 * nothing to install. Free, no AI call.
 */
export interface SplitRoutesOptions {
  prisma: PrismaClient;
  authenticate: preHandlerAsyncHookHandler;
  publicUrl?: string;
  now?: () => Date;
  /** Free push for the lines Zaki writes to the other members. Off when absent. */
  push?: PushSender;
}

const IdParam = z.object({ id: z.uuid() });
const langOf = (u: { language: string }): Lang => (u.language === "en" ? "en" : "ar");
const validPayer = (b: { paid_by: number | null; people: unknown[] }) => b.paid_by === null || b.paid_by < b.people.length;
/** The creator's own splits and the group splits they are one of the people in. */
const visibleTo = (userId: string) => ({ OR: [{ userId }, { memberIds: { has: userId } }] });

export const splitRoutes: FastifyPluginAsync<SplitRoutesOptions> = async (app, opts) => {
  const { prisma } = opts;
  const now = opts.now ?? (() => new Date());
  app.addHook("preHandler", opts.authenticate);
  const base = (req: FastifyRequest) => baseUrl(req, opts.publicUrl);
  /** Creators of splits someone else made: name and InstaPay link. */
  const creatorsOf = async (rows: SplitRow[], me: string) => {
    const ids = [...new Set(rows.filter((r) => r.userId !== me).map((r) => r.userId))];
    const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, instapayLink: true } }) : [];
    return new Map(users.map((u) => [u.id, u]));
  };
  const wire = (req: FastifyRequest, row: SplitRow, creators: Map<string, { name: string | null; instapayLink: string | null }>) => {
    const creator = row.userId === req.user.id ? req.user : creators.get(row.userId);
    return toWireSplit(row, base(req), { id: req.user.id, ownerName: creator?.name ?? null, instapay: creator ? instapayFor(row, creator) : null });
  };
  const respond = async (req: FastifyRequest, row: SplitRow): Promise<SplitResponse> => {
    const split = wire(req, row, await creatorsOf([row], req.user.id));
    return { split, share_text: splitShareText(split, langOf(req.user)) };
  };
  const visible = async (req: FastifyRequest) => {
    const p = IdParam.safeParse(req.params);
    return p.success ? prisma.split.findFirst({ where: { id: p.data.id, ...visibleTo(req.user.id) } }) : null;
  };
  const mine = async (req: FastifyRequest) => {
    const row = await visible(req);
    return row && row.userId === req.user.id ? row : null;
  };
  const tell = (notices: Notice[]) => void pushNotices(prisma, opts.push, notices, app.log);

  app.post("/splits", async (req, reply) => {
    const body = SplitInput.safeParse(req.body);
    if (!body.success || !validPayer(body.data) || (!body.data.items.length && !body.data.subtotal)) return reply.code(400).send({ error: "invalid_body" });
    const group = await groupOf(prisma, req.user.id, body.data);
    if (!group) return reply.code(404).send({ error: "not_found" });
    const data = computeSplit(group.input);
    for (let attempt = 0; ; attempt++) {
      try {
        const row = await prisma.split.create({ data: { ...data, currency: currencyOf(req.user.city).code, code: newInviteCode(), userId: req.user.id, circleId: group.circleId, memberIds: group.memberIds } });
        tell(await tellMembers(prisma, row, req.user, now()));
        return reply.code(201).send(await respond(req, row));
      } catch (err) {
        if (attempt < 4 && err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
        throw err;
      }
    }
  });

  app.get("/splits", async (req) => {
    const rows = await prisma.split.findMany({ where: visibleTo(req.user.id), orderBy: { createdAt: "desc" }, take: 50 });
    const creators = await creatorsOf(rows, req.user.id);
    const res: ListSplitsResponse = { splits: rows.map((r) => wire(req, r, creators)) };
    return res;
  });

  app.get("/splits/:id", async (req, reply) => {
    const row = await visible(req);
    return row ? respond(req, row) : reply.code(404).send({ error: "not_found" });
  });

  /** The creator fixes people or items (who had what) after sending; shares are worked out again. */
  app.put("/splits/:id", async (req, reply) => {
    const row = await mine(req);
    if (!row) return reply.code(404).send({ error: "not_found" });
    const body = UpdateSplitRequest.safeParse(req.body);
    if (!body.success || !validPayer(body.data) || (!body.data.items.length && !body.data.subtotal)) return reply.code(400).send({ error: "invalid_body" });
    // The creator left the circle since: it stays a plain split.
    const g = (await groupOf(prisma, req.user.id, { ...body.data, title: row.title, circle_id: row.circleId })) ?? (await groupOf(prisma, req.user.id, { ...body.data, title: row.title, circle_id: null }))!;
    const updated = await prisma.split.update({ where: { id: row.id }, data: { ...computeSplit(g.input, paidNamesOf(row)), circleId: g.circleId, memberIds: g.memberIds } });
    // Members added by this change hear about it (the others were told once already).
    tell(await tellMembers(prisma, updated, req.user, now()));
    return respond(req, updated);
  });

  /** The creator ticks who has paid them back; a member ticks their own row ("I paid"). */
  app.post("/splits/:id/paid", async (req, reply) => {
    const body = MarkSplitPaidRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    const row = await visible(req);
    if (!row) return reply.code(404).send({ error: "not_found" });
    const people = toWireSplit(row, "").people;
    if (body.data.index >= people.length) return reply.code(400).send({ error: "invalid_body" });
    if (row.userId !== req.user.id) {
      if (people[body.data.index]!.user_id !== req.user.id) return reply.code(403).send({ error: "not_allowed" });
      if (body.data.paid) {
        const done = await markPaid(prisma, row, body.data.index, now(), "member");
        if (done) tell(done.notices);
        return respond(req, done?.row ?? row);
      }
    }
    people[body.data.index]!.paid = body.data.paid;
    const updated = await prisma.split.update({ where: { id: row.id }, data: { peopleJson: people } });
    return respond(req, updated);
  });

  app.delete("/splits/:id", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "invalid_body" });
    await prisma.split.deleteMany({ where: { id: p.data.id, userId: req.user.id } });
    return reply.code(204).send();
  });
};

const COPY = {
  ar: {
    title: "الحساب اتقسم 🧾",
    description: "اتقسم بزكي: كل واحد يدفع اللي طلبه، بالخدمة والضريبة.",
    heading: (t: string) => (t ? `حساب «${esc(t)}»` : "الحساب"),
    total: (m: string) => `الإجمالي ${m} بالخدمة والضريبة`,
    paid: "دفع الحساب",
    settled: "سدّد ✓",
    ordered: (m: string) => `طلب بـ ${m}`,
    sharedBy: "للكل",
    payer: (n: string) => `${esc(n)} دفع الحساب. ابعتوله نصيبكم.`,
    addTitle: "ضيف اللي طلبته",
    addBody: "اختار اسمك واكتب الطلب وسعره، وزكي يحسب نصيبك بالخدمة والضريبة.",
    who: "انت مين؟",
    newName: "اسمي مش موجود",
    newNamePh: "اسمك",
    item: "الطلب",
    itemPh: "مثلاً: بيتزا",
    price: "السعر (من غير خدمة)",
    sharedLabel: "طبق للكل (يتقسم على الكل)",
    add: "ضيف",
    added: (m: string) => `اتضاف 🎉 نصيبك دلوقتي ${m}`,
    full: "الحساب ده مليان، اطلب من اللي بعته يضيف الباقي.",
    bad: "اكتب الطلب وسعره صح.",
    items: "الطلبات",
    cta: "قسّم حسابك الجاي بزكي",
    ctaBody: "زكي بيقسم الحساب على كل واحد باللي طلبه، ويفكّرك باللي ليك، وكمان بيفتكرلك كل حاجة تانية في يومك.",
    install: "نزّل زكي ببلاش",
    soon: "زكي نازل قريب على Google Play.",
    gone: "الحساب ده مش موجود.",
    ai: "زكي ذكاء اصطناعي، مش إنسان.",
    pay: (n: string) => `ادفع لـ${esc(n)} بـ InstaPay`,
    payHint: "هيفتح InstaPay، واكتب نصيبك هناك.",
    paidTitle: "دفعت نصيبك؟",
    paidBody: (n: string) => `اختار اسمك و${esc(n)} هيعرف من زكي.`,
    paidBtn: "دفعت نصيبي ✓",
    paidOk: "اتسجّل إنك دفعت 🎉 شكراً!",
    paidAlready: "متسجّل إنه اتدفع خلاص.",
    recordOnly: "زكي بيسجّل بس، ومش بيمسك أو يحوّل فلوس.",
  },
  en: {
    title: "The bill is split 🧾",
    description: "Split with Zaki: everyone pays for what they ordered, with service and VAT.",
    heading: (t: string) => (t ? `“${esc(t)}”` : "The bill"),
    total: (m: string) => `Total ${m} with service and VAT`,
    paid: "paid the bill",
    settled: "paid back ✓",
    ordered: (m: string) => `ordered ${m}`,
    sharedBy: "for everyone",
    payer: (n: string) => `${esc(n)} paid the bill. Send them your share.`,
    addTitle: "Add what you ordered",
    addBody: "Pick your name, type the item and its price, and Zaki works out your share with service and VAT.",
    who: "Who are you?",
    newName: "My name isn't here",
    newNamePh: "Your name",
    item: "Item",
    itemPh: "e.g. pizza",
    price: "Price (before service)",
    sharedLabel: "A plate for everyone (split by all)",
    add: "Add",
    added: (m: string) => `Added 🎉 Your share is now ${m}`,
    full: "This bill is full; ask whoever sent it to add the rest.",
    bad: "Type the item and a valid price.",
    items: "Items",
    cta: "Split your next bill with Zaki",
    ctaBody: "Zaki splits the bill by what each person ordered, reminds you who owes you, and remembers everything else in your day too.",
    install: "Get Zaki, free",
    soon: "Zaki is coming to Google Play soon.",
    gone: "This bill doesn't exist.",
    ai: "Zaki is an AI, not a person.",
    pay: (n: string) => `Pay ${esc(n)} with InstaPay`,
    payHint: "Opens InstaPay. Type your share there.",
    paidTitle: "Paid your share?",
    paidBody: (n: string) => `Pick your name and Zaki tells ${esc(n)}.`,
    paidBtn: "I paid my share ✓",
    paidOk: "Marked as paid 🎉 Thank you!",
    paidAlready: "That share is already marked paid.",
    recordOnly: "Zaki only keeps the record; it never holds or moves money.",
  },
} as const;

export function renderSplitPage(split: Split | null, lang: Lang, opts: { storeUrl?: string; notice?: string }): string {
  const t = COPY[lang];
  const meta = { title: t.title, description: t.description, footer: t.ai, image: split ? `${split.url}/card.png?lang=${lang}` : undefined };
  if (!split) return renderShell(lang, meta, `<p>${t.gone}</p>`);
  const money = (n: number) => esc(formatAmount(n, split.currency, lang));
  const people = split.people
    .map((p, i) => `<li><strong>${esc(p.name)}</strong>: ${money(p.share)}${p.ordered && split.items.length ? ` <span class="small">(${t.ordered(money(p.ordered))})</span>` : ""}${i === split.paid_by ? ` · ${t.paid}` : p.paid ? ` · ${t.settled}` : ""}</li>`)
    .join("");
  const items = split.items.length
    ? `<h2>${t.items}</h2><ul>${split.items.map((it) => `<li>${esc(it.name)}: ${money(it.price)} · <span class="small">${it.eaters.length ? it.eaters.map((e) => esc(split.people[e]?.name ?? "")).join("، ") : t.sharedBy}</span></li>`).join("")}</ul>`
    : "";
  const payer = split.paid_by !== null ? split.people[split.paid_by]?.name : null;
  const full = split.items.length >= MAX_SPLIT_ITEMS;
  const form = full
    ? `<p class="small">${t.full}</p>`
    : `<h2>${t.addTitle}</h2><p class="small">${t.addBody}</p>
<form method="post" action="/s/${esc(split.code)}/add?lang=${lang}">
<label>${t.who}<br><select name="who">${split.people.map((p, i) => `<option value="${i}">${esc(p.name)}</option>`).join("")}${split.people.length < MAX_SPLIT_PEOPLE ? `<option value="new">${t.newName}</option>` : ""}</select></label>
<p><input name="name" maxlength="40" placeholder="${t.newNamePh}"></p>
<p><label>${t.item}<br><input name="item" maxlength="60" required placeholder="${t.itemPh}"></label></p>
<p><label>${t.price}<br><input name="price" inputmode="decimal" maxlength="10" required></label></p>
<p><label><input type="checkbox" name="shared" value="1"> ${t.sharedLabel}</label></p>
<button class="btn" type="submit">${t.add}</button>
</form>`;
  // The payer's InstaPay link and "I paid" only make sense while someone still owes the payer.
  const owing = split.paid_by === null ? [] : split.people.map((p, i) => ({ p, i })).filter(({ p, i }) => i !== split.paid_by && !p.paid && p.share > 0);
  const pay = payer && split.instapay && owing.length ? `<a class="btn pay" href="${esc(split.instapay)}">${t.pay(payer)}</a><p class="small">${t.payHint}</p>` : "";
  const paidForm =
    payer && owing.length
      ? `<h2>${t.paidTitle}</h2><p class="small">${t.paidBody(payer)}</p>
<form method="post" action="/s/${esc(split.code)}/paid?lang=${lang}">
<p><select name="who">${owing.map(({ p, i }) => `<option value="${i}">${esc(p.name)} · ${money(p.share)}</option>`).join("")}</select></p>
<button class="btn quiet" type="submit">${t.paidBtn}</button>
</form><p class="small">${t.recordOnly}</p>`
      : "";
  const body = `${opts.notice ? `<p><strong>${esc(opts.notice)}</strong></p>` : ""}<h1>${t.heading(split.title)}</h1>
<p>${t.total(money(split.total))}</p>
<ul>${people}</ul>
${payer ? `<p>${t.payer(payer)}</p>` : ""}
${pay}
${paidForm}
${items}
${form}
<h2>${t.cta}</h2>
<p>${t.ctaBody}</p>
${opts.storeUrl ? `<a class="btn" href="${esc(opts.storeUrl)}">${t.install}</a>` : `<p class="small">${t.soon}</p>`}`;
  return renderShell(lang, meta, body);
}

const AddForm = z.object({
  who: z.string().max(4),
  name: z.string().trim().max(40).optional(),
  item: z.string().trim().min(1).max(60),
  price: z.string().trim().max(12),
  shared: z.string().optional(),
});

const toNumber = (raw: string) => {
  const n = Number(raw.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[٬,\s]/g, "").replace("٫", "."));
  return Number.isFinite(n) && n > 0 && n <= 1_000_000 ? n : null;
};

export const splitPageRoutes: FastifyPluginAsync<{ prisma: PrismaClient; publicUrl?: string; storeUrl?: string; push?: PushSender }> = async (app, opts) => {
  const { prisma } = opts;
  // Plain HTML forms post url-encoded bodies (scoped to this plugin).
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string", bodyLimit: 2048 }, (_req, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(String(body))));
  });
  const rateLimit = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } };
  const load = async (raw: string) => {
    const code = normalizeInviteCode(raw);
    return /^[A-Z0-9]{4,20}$/.test(code) ? prisma.split.findUnique({ where: { code } }) : null;
  };
  const send = async (reply: FastifyReply, req: FastifyRequest, row: SplitRow | null, lang: Lang, notice?: string) => {
    const creator = row && payerIsCreator(row) ? await prisma.user.findUnique({ where: { id: row.userId }, select: { instapayLink: true } }) : null;
    const split = row ? toWireSplit(row, baseUrl(req, opts.publicUrl), { id: row.userId, instapay: creator?.instapayLink ?? null }) : null;
    return reply
      .code(row ? 200 : 404)
      .type("text/html; charset=utf-8")
      .header("cache-control", "no-store")
      .send(renderSplitPage(split, lang, { storeUrl: opts.storeUrl, notice }));
  };

  app.get<{ Params: { code: string }; Querystring: { lang?: string } }>("/s/:code", rateLimit, async (req, reply) => {
    const lang = pickLang(req.query.lang, req.headers["accept-language"]);
    const row = await load(req.params.code);
    if (row) await prisma.split.update({ where: { id: row.id }, data: { webViews: { increment: 1 } } });
    return send(reply, req, row, lang);
  });

  /**
   * A friend says they paid their share (a POST form, so a link preview can never answer). The
   * creator hears it in their chat and can untick it: anyone with the link can tap it.
   */
  app.post<{ Params: { code: string }; Querystring: { lang?: string } }>("/s/:code/paid", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const lang = pickLang(req.query.lang, req.headers["accept-language"]);
    const t = COPY[lang];
    const row = await load(req.params.code);
    if (!row) return send(reply, req, null, lang);
    const who = Number(z.object({ who: z.string().max(4) }).safeParse(req.body).data?.who ?? NaN);
    if (!Number.isInteger(who) || who < 0 || row.paidBy === null) return send(reply, req, row, lang, t.bad);
    const done = await markPaid(prisma, row, who, new Date(), "web");
    if (!done) return send(reply, req, row, lang, t.paidAlready);
    void pushNotices(prisma, opts.push, done.notices, app.log);
    return send(reply, req, done.row, lang, t.paidOk);
  });

  /** A friend at the table adds what they ordered: nothing to install, nothing to sign in to. */
  app.post<{ Params: { code: string }; Querystring: { lang?: string } }>("/s/:code/add", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const lang = pickLang(req.query.lang, req.headers["accept-language"]);
    const t = COPY[lang];
    const row = await load(req.params.code);
    if (!row) return send(reply, req, null, lang);
    const form = AddForm.safeParse(req.body);
    const price = form.success ? toNumber(form.data.price) : null;
    if (!form.success || price === null) return send(reply, req, row, lang, t.bad);
    const input = inputOf(row);
    if (input.items.length >= MAX_SPLIT_ITEMS) return send(reply, req, row, lang, t.full);
    let who: number;
    if (form.data.who === "new") {
      const name = form.data.name?.trim();
      if (!name || input.people.length >= MAX_SPLIT_PEOPLE) return send(reply, req, row, lang, t.bad);
      const existing = input.people.findIndex((p) => p.name === name);
      who = existing >= 0 ? existing : input.people.push({ name }) - 1;
    } else {
      who = Number(form.data.who);
      if (!Number.isInteger(who) || who < 0 || who >= input.people.length) return send(reply, req, row, lang, t.bad);
    }
    // Out of the typed bill, if there is one: what no item covers stays shared by everyone.
    input.items.push({ name: form.data.item, price, eaters: form.data.shared ? [] : [who] });
    const updated = await prisma.split.update({ where: { id: row.id }, data: { ...computeSplit(input, paidNamesOf(row)), webAdds: { increment: 1 } } });
    const share = toWireSplit(updated, "").people[who]!.share;
    // The person who made the split hears it in their chat (no gendered verb about the friend in Arabic).
    const owner = await prisma.user.findUnique({ where: { id: row.userId }, select: { language: true } });
    if (owner) {
      const ol: Lang = owner.language === "en" ? "en" : "ar";
      const friend = input.people[who]!.name;
      const title = updated.title || (ol === "en" ? "the bill" : "الحساب");
      const money = formatAmount(price, updated.currency, ol);
      const text = ol === "en" ? `${friend} added ${form.data.item} (${money}) to «${title}»` : `«${title}»: إضافة من ${friend}، ${form.data.item} (${money})`;
      await postUpdate(prisma, row.userId, `split:${row.id}:add:${updated.webAdds}`, text, new Date());
    }
    return send(reply, req, updated, lang, t.added(formatAmount(share, updated.currency, lang)));
  });
};
