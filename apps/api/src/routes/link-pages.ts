import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { cleanWebName, LIST_TITLE_MAX, splitThings, type LinkTaskAnswer, type LinkTaskStatus } from "@fakkarni/shared";
import type { PrismaClient } from "../generated/prisma/client";
import { inBackground } from "../lib/background";
import { whenText } from "../links/rules";
import { answerLinkTask } from "../links/store";
import { addFromWeb, findByCode, tickFromWeb } from "../lists/web";
import type { ListWithItems } from "../lists/store";
import { pushNotices } from "../proactive/notify";
import type { PushSender } from "../proactive/push";
import { ANSWER_LIMIT, acceptForms, backTo, getAppBlock, linkCode, PAGE_LIMIT, postButton, sendPage } from "../web/link-page";
import { esc, pickLang, renderShell, type Lang } from "../web/shell";

/**
 * No-app pages for tasks (/t/:code) and household lists (/l/:code). Someone who is not on Zaki
 * opens the WhatsApp link in any browser and answers with plain forms: no script, no account.
 * The recipe these follow is at the top of web/link-page.ts.
 */
export interface LinkPageOptions {
  prisma: PrismaClient;
  now?: () => Date;
  storeUrl?: string;
  push?: PushSender;
}

const COPY = {
  ar: {
    taskTitle: "طلب على زكي 🌟",
    taskDescription: "طلب من حد من حبايبك. رد من هنا، من غير ما تنزّل حاجة.",
    someone: "حد من حبايبك",
    asks: (name: string) => `طلب من ${name}:`,
    by: (when: string) => `قبل ${when}`,
    yes: "موافق، عليّا",
    already: "عملتها خلاص",
    no: "مش هقدر المرة دي",
    yours: "تمام، دي عليك 🙌",
    done: "خلصت",
    doneTitle: "تسلم إيدك! اتقفلت ✅",
    doneBody: (name: string) => `زكي قال لـ${name}.`,
    declinedTitle: "ولا يهمك 💛",
    declinedBody: (name: string) => `قلنا لـ${name}. لو غيّرت رأيك:`,
    changeMind: "لأ، هعملها",
    told: (name: string) => `زكي هيقول لـ${name}.`,
    goneTitle: "اللينك ده مبقاش شغال",
    goneBody: "اطلب من اللي بعته لينك جديد.",
    listDescription: "قايمة مشتريات البيت. علّم على اللي جبته وضيف اللي ناقص.",
    toGet: (n: number) => (n === 0 ? "كله اتجاب 🎉" : `${n} ${n === 1 ? "حاجة" : n <= 10 ? "حاجات" : "حاجة"} لسه`),
    got: "اتجاب",
    tick: "جبته",
    untick: "رجّعه",
    addTitle: "ناقص حاجة؟",
    addPlaceholder: "عيش، لبن، 2 كيلو طماطم",
    addBtn: "ضيف",
    yourName: "اسمك (اختياري)",
    added: (n: number) => (n === 1 ? "اتضافت ✓" : `اتضاف ${n} ✓`),
    already2: "موجودة في القايمة أصلاً 👍",
    full: "القايمة مليانة. علّم على اللي اتجاب الأول.",
    ticked: "تمام ✓",
    allDone: "كله اتجاب، تسلم إيدك 🎉",
    ai: "زكي ذكاء اصطناعي، مش إنسان.",
  },
  en: {
    taskTitle: "A request on Zaki 🌟",
    taskDescription: "Someone close to you is asking for a hand. Answer here, nothing to install.",
    someone: "A friend",
    asks: (name: string) => `From ${name}:`,
    by: (when: string) => `By ${when}`,
    yes: "Yes, I'll do it",
    already: "Already done",
    no: "I can't this time",
    yours: "Great, it's yours 🙌",
    done: "Done",
    doneTitle: "Thank you! All done ✅",
    doneBody: (name: string) => `Zaki told ${name}.`,
    declinedTitle: "No worries 💛",
    declinedBody: (name: string) => `We told ${name}. If you change your mind:`,
    changeMind: "Actually, I'll do it",
    told: (name: string) => `Zaki will tell ${name}.`,
    goneTitle: "This link no longer works",
    goneBody: "Ask the person who sent it for a new one.",
    listDescription: "A household shopping list. Tick what you got and add what's missing.",
    toGet: (n: number) => (n === 0 ? "Everything is got 🎉" : `${n} to get`),
    got: "Got",
    tick: "Got it",
    untick: "Undo",
    addTitle: "Something missing?",
    addPlaceholder: "bread, milk, 2 kg tomatoes",
    addBtn: "Add",
    yourName: "Your name (optional)",
    added: (n: number) => (n === 1 ? "Added ✓" : `Added ${n} ✓`),
    already2: "Already on the list 👍",
    full: "The list is full. Tick what you got first.",
    ticked: "Got it ✓",
    allDone: "Everything is got, thank you 🎉",
    ai: "Zaki is an AI, not a person.",
  },
} as const;

const LIST_CSS = `
  .items { list-style: none; padding: 0; margin: 12px 0; text-align: start; }
  .items li { display: flex; align-items: center; gap: 10px; border-bottom: 1px solid var(--line); padding: 10px 0; }
  .items li:last-child { border-bottom: 0; }
  .items li .what { flex: 1; font-weight: 600; overflow-wrap: anywhere; }
  .items li .qty { color: var(--soft); font-weight: 400; }
  .items li.done .what { color: var(--soft); text-decoration: line-through; font-weight: 400; }
  .items li form button { font: inherit; font-weight: 700; border-radius: 999px; border: 0; background: var(--primary-soft); color: var(--primary-ink); padding: 6px 16px; cursor: pointer; white-space: nowrap; }
  .items li.done form button { background: var(--wash); color: var(--soft); font-weight: 600; }
  .notice { background: var(--ok-soft); color: var(--ok); border-radius: 14px; padding: 8px 12px; margin: 0 0 12px; font-weight: 600; }
  input[type=text] { width: 100%; font: inherit; border: 1px solid var(--line); border-radius: 16px; padding: 12px 14px; margin-top: 10px; background: #fff; color: var(--ink); }
  input[type=text]:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
  .note { background: var(--wash); border-radius: 16px; padding: 10px 14px; text-align: start; white-space: pre-wrap; overflow-wrap: anywhere; }
`;

/** Escaped text with its web addresses made into links (a homework or task note often holds one). */
const linkify = (s: string) => esc(s).replace(/https?:\/\/[^\s<>"']+/g, (u) => `<a href="${u}" rel="noopener nofollow ugc" target="_blank">${u}</a>`);

const NAME_COOKIE = "zaki_name";
const readName = (req: FastifyRequest): string | null => {
  const raw = req.headers.cookie?.split(/;\s*/).find((c) => c.startsWith(`${NAME_COOKIE}=`));
  if (!raw) return null;
  try {
    return cleanWebName(decodeURIComponent(raw.slice(NAME_COOKIE.length + 1)));
  } catch {
    return null;
  }
};
const nameCookie = (name: string) => `${NAME_COOKIE}=${encodeURIComponent(name)}; Path=/l; Max-Age=${60 * 60 * 24 * 60}; SameSite=Lax; HttpOnly; Secure`;

type TaskRow = { code: string; status: string; otherName: string; title: string; note: string | null; dueAt: Date | null; creator: { name: string | null; timezone: string } };

export function renderTaskPage(task: TaskRow | null, lang: Lang, opts: { storeUrl?: string }): string {
  const t = COPY[lang];
  const meta = { title: t.taskTitle, description: t.taskDescription, footer: t.ai, css: LIST_CSS };
  if (!task || task.status === "cancelled") return renderShell(lang, meta, `<h1>${t.goneTitle}</h1><p>${t.goneBody}</p>`);
  const name = esc(task.creator.name ?? t.someone);
  const action = (answer: LinkTaskAnswer) => `/t/${esc(task.code)}/${answer}?lang=${lang}`;
  const due = task.dueAt ? `<p class="small">${esc(t.by(whenText(task.dueAt, task.creator.timezone, lang)))}</p>` : "";
  const what = `<h1>${esc(task.title)}</h1>${due}${task.note ? `<p class="note">${linkify(task.note)}</p>` : ""}`;
  const status = task.status as LinkTaskStatus;
  if (status === "pending")
    return renderShell(
      lang,
      meta,
      `<p>${t.asks(name)}</p>${what}${postButton(action("accept"), t.yes)}${postButton(action("done"), t.already, "btn ghost")}${postButton(action("decline"), t.no, "btn quiet")}<p class="small">${t.told(name)}</p>`,
    );
  if (status === "accepted") return renderShell(lang, meta, `<p>${t.yours}</p>${what}${postButton(action("done"), t.done)}<p class="small">${t.told(name)}</p>`);
  if (status === "declined") return renderShell(lang, meta, `<h1>${t.declinedTitle}</h1><p>${t.declinedBody(name)}</p>${postButton(action("accept"), t.changeMind, "btn ghost")}`);
  return renderShell(lang, meta, `<h1>${t.doneTitle}</h1><p>${esc(task.title)}</p><p>${t.doneBody(name)}</p>${getAppBlock(lang, opts)}`);
}

export function renderListPage(list: ListWithItems | null, lang: Lang, opts: { storeUrl?: string; name: string | null; notice?: string | undefined }): string {
  const t = COPY[lang];
  const meta = { title: list ? `🛒 ${list.name}` : t.goneTitle, description: t.listDescription, footer: t.ai, css: LIST_CSS };
  if (!list || !list.shareCode) return renderShell(lang, meta, `<h1>${t.goneTitle}</h1><p>${t.goneBody}</p>`);
  const base = `/l/${esc(list.shareCode)}`;
  const open = list.items.filter((i) => !i.doneAt);
  const done = list.items.filter((i) => i.doneAt);
  const row = (i: (typeof list.items)[number], isDone: boolean) =>
    `<li class="${isDone ? "done" : ""}"><span class="what">${esc(i.title)}${i.qty ? ` <span class="qty">(${esc(i.qty)})</span>` : ""}</span>${postButton(
      `${base}/tick?lang=${lang}`,
      isDone ? t.untick : t.tick,
      "",
      { item: i.id, done: isDone ? "0" : "1" },
    )}</li>`;
  const notice = opts.notice ? `<p class="notice">${esc(opts.notice)}</p>` : "";
  const items = open.length || done.length ? `<ul class="items">${open.map((i) => row(i, false)).join("")}${done.map((i) => row(i, true)).join("")}</ul>` : "";
  const add = `<h2>${t.addTitle}</h2>
<form method="post" action="${base}/add?lang=${lang}">
<input type="text" name="things" maxlength="${LIST_TITLE_MAX * 4}" placeholder="${esc(t.addPlaceholder)}" required>
<input type="text" name="name" maxlength="40" placeholder="${esc(t.yourName)}" value="${esc(opts.name ?? "")}" autocomplete="name">
<button class="btn" type="submit">${t.addBtn}</button>
</form>`;
  return renderShell(
    lang,
    meta,
    `${notice}<h1>🛒 ${esc(list.name)}</h1>${list.circle ? `<p class="small">${esc(list.circle.name)}</p>` : ""}<p><span class="chip">${esc(t.toGet(open.length))}</span></p>${items}${add}${getAppBlock(lang, opts)}`,
  );
}

const NOTICES = ["added", "already", "full", "ticked", "alldone"] as const;
type NoticeKey = (typeof NOTICES)[number];

export const linkPageRoutes: FastifyPluginAsync<LinkPageOptions> = async (app, opts) => {
  const { prisma } = opts;
  const now = opts.now ?? (() => new Date());
  acceptForms(app);

  // ---- Tasks: /t/:code ----
  const loadTask = async (raw: string) => {
    const code = linkCode(raw);
    return code ? prisma.linkTask.findUnique({ where: { code }, include: { creator: { select: { name: true, timezone: true } } } }) : null;
  };

  app.get<{ Params: { code: string }; Querystring: { lang?: string } }>("/t/:code", PAGE_LIMIT, async (req, reply) => {
    const lang = pickLang(req.query.lang, req.headers["accept-language"]);
    const task = await loadTask(req.params.code);
    if (task && task.status !== "cancelled") inBackground(prisma.linkTask.update({ where: { id: task.id }, data: { webViews: { increment: 1 } } }));
    return sendPage(reply, Boolean(task && task.status !== "cancelled"), renderTaskPage(task, lang, { storeUrl: opts.storeUrl }));
  });

  // POST, so a link preview can never answer for anyone.
  for (const answer of ["accept", "decline", "done"] as const) {
    app.post<{ Params: { code: string }; Querystring: { lang?: string } }>(`/t/:code/${answer}`, ANSWER_LIMIT, async (req, reply) => {
      const lang = pickLang(req.query.lang, req.headers["accept-language"]);
      const task = await loadTask(req.params.code);
      if (!task || task.status === "cancelled") return sendPage(reply, false, renderTaskPage(null, lang, {}));
      const out = await answerLinkTask(prisma, task, answer, now());
      if (out) void pushNotices(prisma, opts.push, out.notices, app.log);
      return backTo(reply, `/t/${task.code}`, lang);
    });
  }

  // ---- Household lists: /l/:code ----
  const loadList = async (raw: string) => {
    const code = linkCode(raw);
    return code ? findByCode(prisma, code, now()) : null;
  };

  app.get<{ Params: { code: string }; Querystring: { lang?: string; ok?: string } }>("/l/:code", PAGE_LIMIT, async (req, reply) => {
    const lang = pickLang(req.query.lang, req.headers["accept-language"]);
    const list = await loadList(req.params.code);
    const key = NOTICES.find((n) => n === req.query.ok);
    const t = COPY[lang];
    const words: Record<NoticeKey, string> = { added: t.added(1), already: t.already2, full: t.full, ticked: t.ticked, alldone: t.allDone };
    return sendPage(reply, Boolean(list), renderListPage(list, lang, { storeUrl: opts.storeUrl, name: readName(req), notice: key ? words[key] : undefined }));
  });

  app.post<{ Params: { code: string }; Querystring: { lang?: string } }>("/l/:code/add", ANSWER_LIMIT, async (req, reply) => {
    const lang = pickLang(req.query.lang, req.headers["accept-language"]);
    const list = await loadList(req.params.code);
    if (!list) return sendPage(reply, false, renderListPage(null, lang, { name: null }));
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = cleanWebName(body.name) ?? readName(req);
    if (cleanWebName(body.name)) reply.header("set-cookie", nameCookie(name!));
    const things = typeof body.things === "string" ? splitThings(body.things.slice(0, LIST_TITLE_MAX * 4)) : [];
    if (!things.length) return backTo(reply, `/l/${list.shareCode}`, lang);
    const out = await addFromWeb(prisma, list, things, name, now());
    void pushNotices(prisma, opts.push, out.notices, app.log);
    const owner = list.ownerId;
    if (out.added.length && owner) inBackground(prisma.event.create({ data: { userId: owner, name: "list_items_added", propsJson: { count: out.added.length, via: "web", shared: Boolean(list.circleId) } } }));
    return backTo(reply, `/l/${list.shareCode}`, lang, out.added.length ? "added" : out.full ? "full" : "already");
  });

  app.post<{ Params: { code: string }; Querystring: { lang?: string } }>("/l/:code/tick", ANSWER_LIMIT, async (req, reply) => {
    const lang = pickLang(req.query.lang, req.headers["accept-language"]);
    const list = await loadList(req.params.code);
    if (!list) return sendPage(reply, false, renderListPage(null, lang, { name: null }));
    const body = (req.body ?? {}) as Record<string, unknown>;
    const itemId = typeof body.item === "string" && /^[0-9a-f-]{36}$/i.test(body.item) ? body.item : null;
    if (!itemId) return backTo(reply, `/l/${list.shareCode}`, lang);
    const done = body.done !== "0";
    const out = await tickFromWeb(prisma, list, itemId, done, readName(req), now());
    void pushNotices(prisma, opts.push, out.notices, app.log);
    return backTo(reply, `/l/${list.shareCode}`, lang, out.notices.length ? "alldone" : done && out.changed ? "ticked" : undefined);
  });
};
