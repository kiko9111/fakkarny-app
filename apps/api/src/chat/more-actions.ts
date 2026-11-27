import { CheckinKind, currencyOf, isRamadanSeason, MAX_SPLIT_PEOPLE, parseInstapayLink, SplitInput, type AppAction } from "@fakkarni/shared";
import { Prisma, type PrismaClient, type User } from "../generated/prisma/client";
import { askCheckin, inviteToIftar, postCheckin, removeMember } from "../circles/ops";
import { cancelEntry, createEntry, respond as respondDaftar, settle as settleDaftar, withPeople as daftarPeople, type EntryWithPeople } from "../daftar/store";
import { canCancel as canCancelDaftar, canNudge as canNudgeDaftar, canRespond as canRespondDaftar, canSettle } from "../daftar/rules";
import { localToUtc, toLocalIso } from "../lib/time";
import { safeLocalToUtc } from "../pipeline/apply";
import type { ReplyLang } from "../pipeline/rules";
import type { Notice } from "../proactive/notify";
import { computeSplit } from "../split/store";
import { groupOf, markPaid, tellMembers } from "../split/group";
import { canCancel as canCancelTask, canNudge as canNudgeTask, canRespond as canRespondTask, canSetRemind } from "../tasks/rules";
import { cancel as cancelTask, nudge as nudgeTask, respond as respondTask, reviewHomework, roleOf, submitHomework, withPeople as taskPeople, type TaskWithPeople } from "../tasks/store";
import { addRamadanPack } from "../trackers/store";
import { trackerLabel } from "../trackers/labels";
import { newInviteCode } from "../circles/rules";
import { card, findTracker, kindOf, pickCircle, type Ctx, type One } from "./actions";
import { foldName, LABEL, matchByName, type PendingPayload, type StoredCard } from "./cards";
import { confirmTrip, runListAction } from "../lists/chat";
import { assignHomeworkBatch } from "../homework/store";

/**
 * The app actions added on 2026-11-23 ("Zaki can do everything in the app from the chat"):
 * Daftar, more money and tracker actions, circle actions, task answers and homework, the bill
 * split, memories, settings and places in the app. Same rules as ./actions.ts: the user's own
 * things happen now (with an Undo on the card where it makes sense); anything that reaches other
 * people becomes a pending card holding resolved ids; card words come from LABEL, never the model.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (s: string | undefined): s is string => !!s && UUID.test(s);

export async function runMore(ctx: Ctx, a: AppAction): Promise<One> {
  const { lang } = ctx;
  const fail = (label: string, route: string | null = null): One => ({ card: card(lang, a.kind, "failed", label, route) });
  switch (a.kind) {
    // ---------------------------------------------------------------- money
    case "delete_money_entry": {
      const section = a.section ? matchByName(ctx.data.sections, a.section, (s) => [s.name]) : null;
      if (a.section && !section) return fail(LABEL.notFound(lang, "section", a.section), "/money");
      const own = ctx.data.sections.filter((s) => !s.circleId).map((s) => s.id);
      const rows = await ctx.prisma.moneyEntry.findMany({
        where: { userId: ctx.user.id, sectionId: section ? section.id : { in: own }, at: { gte: new Date(ctx.now.getTime() - 62 * 86_400_000) }, ...(a.amount ? { amount: new Prisma.Decimal(a.amount) } : {}) },
        include: { section: true },
        orderBy: { at: "desc" },
        take: 20,
      });
      const want = a.note ? foldName(a.note) : "";
      const entry = rows.find((r) => !want || foldName(r.note ?? "").includes(want) || want.includes(foldName(r.note ?? "") || "\u0000")) ?? null;
      if (!entry) return fail(LABEL.noEntry(lang), "/money");
      // A shared book's entry was already shown to the others: delete it from the book itself.
      if (entry.section.circleId) return fail(LABEL.notAllowed(lang), `/money/${entry.sectionId}`);
      await ctx.prisma.moneyEntry.delete({ where: { id: entry.id } });
      return {
        card: card(lang, a.kind, "done", LABEL.entryDeleted(lang, Number(entry.amount), entry.section.name), `/money/${entry.sectionId}`, undefined, {
          kind: "money_entry_restore",
          sectionId: entry.sectionId,
          amount: Number(entry.amount),
          note: entry.note,
          split: entry.split,
          source: entry.source,
          at: entry.at.toISOString(),
        }),
      };
    }
    case "delete_section": {
      const s = matchByName(ctx.data.sections, a.section ?? a.name, (x) => [x.name]);
      if (!s) return fail(LABEL.notFound(lang, "section", a.section ?? a.name), "/money");
      if (s.ownerId !== ctx.user.id) return fail(LABEL.ownerOnly(lang, s.name), `/money/${s.id}`);
      const entries = await ctx.prisma.moneyEntry.count({ where: { sectionId: s.id } });
      return { card: card(lang, a.kind, "pending", LABEL.sectionDeleteAsk(lang, s.name, entries), `/money/${s.id}`, { kind: "delete_section", sectionId: s.id }) };
    }

    // ---------------------------------------------------------------- Daftar
    case "daftar_add": {
      if (!a.person || !a.amount) return fail(LABEL.failed(lang));
      const dir = a.direction ?? "owed_to_me";
      const plan = planDaftar(ctx, a.person, dir, a.amount, a.note ?? null);
      if (plan.member) return { card: card(lang, a.kind, "pending", LABEL.daftarAsk(lang, plan.payload.otherName, a.amount, dir, true), "/money", plan.payload) };
      const entry = await createEntry(ctx.prisma, ctx.user, plan.payload, ctx.now);
      return { card: card(lang, a.kind, "done", LABEL.daftarMade(lang, entry.otherName, a.amount, dir, false), `/daftar/${entry.code}`, undefined, { kind: "daftar_entry", entryId: entry.id }) };
    }
    case "daftar_settle":
    case "daftar_cancel":
    case "daftar_answer":
    case "daftar_remind": {
      const e = await findEntry(ctx, a);
      if (!e) {
        // "Cancel/settle Karim's debt" often means a debt Zaki saved as an item, not a Daftar entry.
        if ((a.kind === "daftar_cancel" || a.kind === "daftar_settle") && a.person) {
          const debt = await findDebtItem(ctx, a);
          if (debt) {
            const cancelled = a.kind === "daftar_cancel";
            await ctx.prisma.item.update({ where: { id: debt.id }, data: { status: cancelled ? "cancelled" : "done" } });
            return { card: card(lang, a.kind, "done", LABEL.debtClosed(lang, debt.debtPerson ?? a.person, cancelled), "/money", undefined, { kind: "item_status", itemId: debt.id, status: "open" }) };
          }
        }
        return fail(LABEL.noDaftar(lang, a.person), "/money");
      }
      const role = e.creatorId === ctx.user.id ? "creator" : "other";
      const name = role === "creator" ? e.other?.name ?? e.otherName : e.creator.name ?? "?";
      const amount = Number(e.amount);
      if (a.kind === "daftar_settle") {
        if (!canSettle(e.status)) return fail(LABEL.notAllowed(lang), `/daftar/${e.code}`);
        return { card: card(lang, a.kind, "pending", LABEL.daftarSettleAsk(lang, name, amount), `/daftar/${e.code}`, { kind: "daftar_settle", entryId: e.id }) };
      }
      if (a.kind === "daftar_cancel") {
        if (!canCancelDaftar(e.status, role)) return fail(LABEL.notAllowed(lang), `/daftar/${e.code}`);
        return { card: card(lang, a.kind, "pending", LABEL.daftarCancelAsk(lang, name, amount), `/daftar/${e.code}`, { kind: "daftar_cancel", entryId: e.id }) };
      }
      if (a.kind === "daftar_answer") {
        if (!canRespondDaftar(e.status, role)) return fail(LABEL.notAllowed(lang), `/daftar/${e.code}`);
        const yes = a.answer !== "no";
        return { card: card(lang, a.kind, "pending", LABEL.daftarAnswerAsk(lang, name, amount, yes), `/daftar/${e.code}`, { kind: "daftar_answer", entryId: e.id, answer: yes ? "confirm" : "dispute" }) };
      }
      // A reminder link goes out from the user's own WhatsApp: the card opens it, nothing is sent here.
      const may = (role === "creator" && e.status === "pending") || canNudgeDaftar(e.status, role, e.direction);
      if (!may) return fail(LABEL.daftarNotYet(lang), `/daftar/${e.code}`);
      return { card: card(lang, a.kind, "done", LABEL.daftarRemind(lang, name), `/daftar/${e.code}`) };
    }

    // ---------------------------------------------------------------- trackers
    case "undo_tracker": {
      const t = findTracker(ctx, a.tracker ?? a.name, a.tracker_kind);
      if (!t) return fail(LABEL.notFound(lang, "tracker", a.tracker ?? a.name), "/trackers");
      const label = trackerLabel(kindOf(t), t.name, lang);
      const dayStart = localToUtc(`${toLocalIso(ctx.now, ctx.user.timezone).slice(0, 10)}T00:00`, ctx.user.timezone);
      const last = await ctx.prisma.trackerEntry.findFirst({ where: { trackerId: t.id, at: { gte: dayStart } }, orderBy: { at: "desc" } });
      if (!last) return fail(LABEL.trackerNothing(lang, label), "/trackers");
      await ctx.prisma.trackerEntry.delete({ where: { id: last.id } });
      return { card: card(lang, a.kind, "done", LABEL.trackerUndone(lang, label), "/trackers", undefined, { kind: "tracker_entry_restore", trackerId: t.id, amount: Number(last.amount), source: last.source, at: last.at.toISOString() }) };
    }
    case "delete_tracker": {
      const t = findTracker(ctx, a.tracker ?? a.name, a.tracker_kind);
      if (!t) return fail(LABEL.notFound(lang, "tracker", a.tracker ?? a.name), "/trackers");
      return { card: card(lang, a.kind, "pending", LABEL.trackerDeleteAsk(lang, trackerLabel(kindOf(t), t.name, lang)), "/trackers", { kind: "delete_tracker", trackerId: t.id }) };
    }
    case "ramadan_pack": {
      if (!isRamadanSeason(ctx.now)) return fail(LABEL.notRamadan(lang), "/trackers");
      const made = await addRamadanPack(ctx.prisma, ctx.user, ctx.now);
      if (made === "off") return fail(LABEL.notRamadan(lang), "/trackers");
      return { card: card(lang, a.kind, "done", LABEL.ramadanPack(lang, made.length), "/trackers"), refresh: true };
    }

    // ---------------------------------------------------------------- circles
    case "invite": {
      const c = pickCircle(ctx, a.circle ?? a.name);
      if (!c) return fail(a.circle ? LABEL.notFound(lang, "circle", a.circle) : LABEL.notFound(lang, "which_circle"), "/circles");
      // The phone makes the link and opens WhatsApp from the user's own number.
      return { card: card(lang, a.kind, "done", LABEL.invite(lang, c.name), `/circle/${c.id}?invite=1`) };
    }
    case "join_circle": {
      const code = (a.text ?? a.name ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      if (code.length < 6) return fail(LABEL.badCode(lang), "/invite");
      const invite = await ctx.prisma.invite.findUnique({ where: { code }, include: { circle: { select: { name: true } } } });
      if (!invite) return fail(LABEL.badCode(lang), "/invite");
      return { card: card(lang, a.kind, "done", LABEL.open(lang, `«${invite.circle.name}»`), `/invite/${code}`) };
    }
    case "rename_circle": {
      const c = pickCircle(ctx, a.circle);
      const name = a.name?.slice(0, 40);
      if (!c || !name) return fail(c ? LABEL.failed(lang) : LABEL.notFound(lang, a.circle ? "circle" : "which_circle", a.circle), "/circles");
      const me = await ctx.prisma.circleMember.findUnique({ where: { circleId_userId: { circleId: c.id, userId: ctx.user.id } } });
      if (me?.role !== "owner") return fail(LABEL.ownerOnlyCircle(lang, c.name), `/circle/${c.id}`);
      await ctx.prisma.circle.update({ where: { id: c.id }, data: { name } });
      return { card: card(lang, a.kind, "done", LABEL.renamed(lang, c.name, name), `/circle/${c.id}`, undefined, { kind: "rename", circleId: c.id, name: c.name }), refresh: true };
    }
    case "leave_circle": {
      const c = pickCircle(ctx, a.circle ?? a.name);
      if (!c) return fail(a.circle ? LABEL.notFound(lang, "circle", a.circle) : LABEL.notFound(lang, "which_circle"), "/circles");
      return { card: card(lang, a.kind, "pending", LABEL.leaveAsk(lang, c.name), `/circle/${c.id}`, { kind: "leave_circle", circleId: c.id }) };
    }
    case "checkin": {
      const c = pickCircle(ctx, a.circle) ?? (a.circle ? null : onlyFamily(ctx));
      if (!c) return fail(a.circle ? LABEL.notFound(lang, "circle", a.circle) : LABEL.notFound(lang, "which_circle"), "/circles");
      const kind = a.checkin_kind ?? "ok";
      const what = checkinWords(lang, kind, a.note ?? null);
      return { card: card(lang, a.kind, "pending", LABEL.checkinAsk(lang, c.name, what), `/circle/${c.id}`, { kind: "checkin", circleId: c.id, checkinKind: kind, note: a.note ?? null }) };
    }
    case "ask_checkin": {
      const hit = findMember(ctx, a.person, a.circle);
      if (!hit) return fail(LABEL.notFound(lang, "person", a.person), "/circles");
      return { card: card(lang, a.kind, "pending", LABEL.askCheckinAsk(lang, hit.member.name ?? a.person ?? "?"), `/circle/${hit.circle.id}`, { kind: "ask_checkin", circleId: hit.circle.id, userId: hit.member.userId }) };
    }
    case "iftar": {
      const c = pickCircle(ctx, a.circle) ?? (a.circle ? null : onlyFamily(ctx));
      if (!c) return fail(a.circle ? LABEL.notFound(lang, "circle", a.circle) : LABEL.notFound(lang, "which_circle"), "/circles");
      const on = a.due_at_local?.slice(0, 10) ?? toLocalIso(ctx.now, ctx.user.timezone).slice(0, 10);
      return { card: card(lang, a.kind, "pending", LABEL.iftarAsk(lang, c.name, on), `/circle/${c.id}`, { kind: "iftar", circleId: c.id, on, note: a.note ?? null }) };
    }

    // ---------------------------------------------------------------- tasks
    case "task_answer":
    case "task_nudge":
    case "task_cancel":
    case "task_remind":
    case "homework_submit":
    case "homework_review": {
      const t = await findTask(ctx, a);
      if (!t) return fail(LABEL.noTask(lang), "/circles");
      const role = roleOf(t, ctx.user.id);
      const other = role === "assigner" ? t.assignee.name ?? "?" : t.assigner.name ?? "?";
      const route = `/circle/${t.circleId}`;
      if (a.kind === "task_answer") {
        if (!canRespondTask(t.status, role)) return fail(LABEL.notAllowed(lang), route);
        const yes = a.answer !== "no";
        return { card: card(lang, a.kind, "pending", LABEL.taskAnswerAsk(lang, other, t.title, yes), route, { kind: "task_answer", taskId: t.id, answer: yes ? "accept" : "decline" }) };
      }
      if (a.kind === "task_nudge") {
        if (!canNudgeTask(t, role, ctx.now)) return fail(LABEL.notAllowed(lang), route);
        return { card: card(lang, a.kind, "pending", LABEL.nudgeAsk(lang, other, t.title), route, { kind: "task_nudge", taskId: t.id }) };
      }
      if (a.kind === "task_cancel") {
        if (!canCancelTask(t.status, role)) return fail(LABEL.notAllowed(lang), route);
        return { card: card(lang, a.kind, "pending", LABEL.taskCancelAsk(lang, other, t.title), route, { kind: "task_cancel", taskId: t.id }) };
      }
      if (a.kind === "task_remind") {
        if (!canSetRemind(t.status, role)) return fail(LABEL.notAllowed(lang), route);
        const remindAt = safeLocalToUtc(a.remind_at_local ?? a.due_at_local, ctx.user.timezone);
        await setTaskRemind(ctx.prisma, t, remindAt);
        const at = remindAt ? toLocalIso(remindAt, ctx.user.timezone).replace("T", " ").slice(0, 16) : null;
        return { card: card(lang, a.kind, "done", LABEL.taskRemind(lang, t.title, at), route, undefined, { kind: "task_remind", taskId: t.id, remindAt: t.remindAt?.toISOString() ?? null }) };
      }
      if (a.kind === "homework_submit") {
        const text = (a.text ?? a.note)?.trim();
        if (role !== "assignee" || !t.homework || !text) return fail(LABEL.notAllowed(lang), route);
        return { card: card(lang, a.kind, "pending", LABEL.submitAsk(lang, other, t.title), route, { kind: "homework_submit", taskId: t.id, text: text.slice(0, 1000) }) };
      }
      if (role !== "assigner" || !t.homework) return fail(LABEL.notAllowed(lang), route);
      const ok = a.answer !== "no";
      return { card: card(lang, a.kind, "pending", LABEL.reviewAsk(lang, other, t.title, ok), route, { kind: "homework_review", taskId: t.id, verdict: ok ? "approved" : "redo", note: a.note ?? null }) };
    }

    // ---------------------------------------------------------------- bill split
    case "split_bill": {
      // A circle: everyone in it sees their share, so it waits for the user's OK.
      if (a.circle) {
        const c = pickCircle(ctx, a.circle);
        if (!c || !a.amount) return fail(LABEL.notFound(lang, "circle"), "/split/new");
        const others = c.members.filter((m) => m.userId !== ctx.user.id);
        if (!others.length) return fail(LABEL.failed(lang), "/split/new");
        return { card: card(lang, a.kind, "pending", LABEL.splitCircleAsk(lang, a.amount, c.name, others.length + 1), `/circle/${c.id}`, { kind: "split_circle", circleId: c.id, amount: a.amount, title: (a.name ?? a.title ?? "").slice(0, 60) }) };
      }
      const people = [...new Set((a.people ?? []).map((p) => p.trim()).filter(Boolean))].slice(0, 19);
      if (!a.amount || !people.length) return fail(LABEL.failed(lang), "/split/new");
      const me = ctx.user.name ?? (lang === "english" ? "Me" : "أنا");
      const input = SplitInput.safeParse({ title: (a.name ?? a.title ?? "").slice(0, 60), people: [{ name: me }, ...people.map((name) => ({ name }))], subtotal: a.amount, service_pct: 0, vat_pct: 0, paid_by: 0 });
      if (!input.success) return fail(LABEL.failed(lang), "/split/new");
      const data = computeSplit(input.data);
      const row = await createSplit(ctx.prisma, ctx.user, data);
      await ctx.prisma.event.create({ data: { userId: ctx.user.id, name: "split_created", propsJson: { via: "chat", people: people.length + 1 } } });
      const share = Math.round(a.amount / (people.length + 1));
      return { card: card(lang, a.kind, "done", LABEL.splitMade(lang, a.amount, people.length + 1, share), `/split/${row.id}`, undefined, { kind: "split", splitId: row.id }) };
    }
    case "split_paid": {
      const splits = isId(a.ref)
        ? await ctx.prisma.split.findMany({ where: { id: a.ref, userId: ctx.user.id } })
        : await ctx.prisma.split.findMany({ where: { userId: ctx.user.id }, orderBy: { createdAt: "desc" }, take: 5 });
      for (const s of splits) {
        const people = s.peopleJson as { name: string; paid: boolean }[];
        const hit = matchByName(people.map((p, i) => ({ ...p, i })), a.person, (p) => [p.name]);
        if (!hit) continue;
        people[hit.i]!.paid = true;
        await ctx.prisma.split.update({ where: { id: s.id }, data: { peopleJson: people } });
        return { card: card(lang, a.kind, "done", LABEL.splitPaid(lang, hit.name), `/split/${s.id}`, undefined, { kind: "split_paid", splitId: s.id, index: hit.i }) };
      }
      return fail(LABEL.noSplit(lang), "/money");
    }

    // ---------------------------------------------------------------- memories, settings, places
    case "list_add":
    case "list_done":
    case "list_trip":
      return runListAction(ctx, a);
    case "forget":
      return forget(ctx, a);
    case "settings":
      return changeSetting(ctx, a);
    case "open_screen": {
      const screen = a.screen ?? "settings";
      const [route, name] = SCREENS[screen];
      return { card: card(lang, a.kind, "done", LABEL.open(lang, name[lang]), route) };
    }
    default:
      return fail(LABEL.failed(lang));
  }
}

const SCREENS: Record<NonNullable<AppAction["screen"]>, [string, Record<ReplyLang, string>]> = {
  memories: ["/memories", { arabic: "اللي فاكره عنك", english: "what I remember" }],
  settings: ["/settings", { arabic: "الإعدادات", english: "Settings" }],
  money: ["/money", { arabic: "الفلوس", english: "Money" }],
  daftar: ["/money", { arabic: "الدفتر", english: "the Daftar" }],
  trackers: ["/trackers", { arabic: "المتابعات", english: "Trackers" }],
  circles: ["/circles", { arabic: "الدواير", english: "Circles" }],
  today: ["/today", { arabic: "النهارده", english: "Today" }],
  receipt: ["/receipt", { arabic: "قراية فاتورة بصورة", english: "read a receipt photo" }],
  invite_friend: ["/settings", { arabic: "اعزم صاحبك", english: "Invite a friend" }],
  paywall: ["/paywall", { arabic: "زكي برو", english: "Zaki Pro" }],
  split: ["/split/new", { arabic: "تقسيم الحساب", english: "Split the bill" }],
  session: ["/session", { arabic: "مساحة تفكير", english: "a space to reflect" }],
  lists: ["/list", { arabic: "قوايم البيت", english: "your lists" }],
};

function checkinWords(lang: ReplyLang, kind: CheckinKind, note: string | null): string {
  const words: Record<CheckinKind, Record<ReplyLang, string>> = {
    arrived: { arabic: "وصلت", english: "arrived" },
    home: { arabic: "في البيت", english: "home" },
    on_way: { arabic: "في الطريق", english: "on the way" },
    medicine: { arabic: "خدت الدوا", english: "took the medicine" },
    ok: { arabic: "تمام", english: "all good" },
  };
  return `${words[kind][lang]}${note ? ` (${note})` : ""}`;
}

/** The user's family circle when they have exactly one (for "I'm home"). */
function onlyFamily(ctx: Ctx): Ctx["data"]["circles"][number] | null {
  const fam = ctx.data.circles.filter((c) => c.kind === "family");
  return fam.length === 1 ? fam[0]! : null;
}

/** A person in the user's circles (optionally one circle); the same person in two circles is one person. */
export function findMember(ctx: Pick<Ctx, "data" | "user">, person: string | undefined, circle?: string) {
  const circles = circle ? ctx.data.circles.filter((c) => matchByName([c], circle, (x) => [x.name])) : ctx.data.circles;
  const hits = circles.flatMap((c) => c.members.filter((m) => m.userId !== ctx.user.id).map((m) => ({ circle: c, member: m })));
  return matchByName([...new Map(hits.map((h) => [h.member.userId, h])).values()], person, (h) => [h.member.name]);
}

/** A Daftar entry for a person: a circle member gets it in their app (after the user's OK). */
export function planDaftar(ctx: Pick<Ctx, "data" | "user">, person: string, direction: "owed_to_me" | "i_owe", amount: number, note: string | null): { member: boolean; payload: Extract<PendingPayload, { kind: "daftar_add" }> } {
  const hit = findMember(ctx, person);
  return {
    member: Boolean(hit),
    payload: { kind: "daftar_add", otherName: (hit?.member.name ?? person).slice(0, 60), direction, amount, note: note?.slice(0, 200) ?? null, circleId: hit?.circle.id ?? null, otherUserId: hit?.member.userId ?? null },
  };
}

async function findEntry(ctx: Ctx, a: AppAction): Promise<EntryWithPeople | null> {
  const mine = { OR: [{ creatorId: ctx.user.id }, { otherUserId: ctx.user.id }] };
  if (isId(a.ref)) return ctx.prisma.daftarEntry.findFirst({ where: { id: a.ref, ...mine, status: { not: "cancelled" } }, include: daftarPeople });
  const open = await ctx.prisma.daftarEntry.findMany({ where: { ...mine, status: { in: ["pending", "confirmed", "disputed"] } }, include: daftarPeople, orderBy: { createdAt: "desc" }, take: 30 });
  const named = a.person ? open.filter((e) => matchByName([e], a.person, (x) => [x.creatorId === ctx.user.id ? x.other?.name ?? x.otherName : x.creator.name, x.otherName])) : open;
  const byAmount = a.amount ? named.filter((e) => Number(e.amount) === a.amount) : named;
  return byAmount.length === 1 ? byAmount[0]! : null;
}

/** The one open debt item that fits the person (and amount, when given). */
async function findDebtItem(ctx: Ctx, a: AppAction) {
  const open = await ctx.prisma.item.findMany({ where: { userId: ctx.user.id, status: "open", type: "debt" }, orderBy: { updatedAt: "desc" }, take: 30 });
  const named = open.filter((i) => matchByName([i], a.person!, (x) => [x.debtPerson ?? "", x.title]));
  const byAmount = a.amount ? named.filter((i) => Number(i.debtAmount) === a.amount) : named;
  return byAmount.length === 1 ? byAmount[0]! : null;
}

async function findTask(ctx: Ctx, a: AppAction): Promise<TaskWithPeople | null> {
  const mine = { OR: [{ assignerId: ctx.user.id }, { assigneeId: ctx.user.id }] };
  if (isId(a.ref)) return ctx.prisma.circleTask.findFirst({ where: { id: a.ref, ...mine }, include: taskPeople });
  // No id: the one open task that fits the person and words.
  const homeworkOnly = a.kind === "homework_submit" || a.kind === "homework_review";
  const rows = await ctx.prisma.circleTask.findMany({
    where: { ...mine, status: { in: a.kind === "homework_review" ? ["accepted", "done"] : ["pending", "accepted"] }, ...(homeworkOnly ? { homework: true } : {}), ...(a.kind === "task_answer" ? { assigneeId: ctx.user.id, status: "pending" } : {}) },
    include: taskPeople,
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  const byPerson = a.person ? rows.filter((t) => matchByName([t], a.person, (x) => [x.assignerId === ctx.user.id ? x.assignee.name : x.assigner.name])) : rows;
  const byTitle = a.title ? byPerson.filter((t) => matchByName([t], a.title, (x) => [x.title])) : byPerson;
  return byTitle.length === 1 ? byTitle[0]! : null;
}

async function setTaskRemind(prisma: PrismaClient, t: TaskWithPeople, remindAt: Date | null) {
  await prisma.$transaction(async (tx) => {
    if (t.itemId) await tx.item.updateMany({ where: { id: t.itemId, userId: t.assigneeId }, data: { remindAt: remindAt ?? t.dueAt, ...(remindAt || t.dueAt ? { type: "reminder" } : {}) } });
    await tx.circleTask.update({ where: { id: t.id }, data: { remindAt } });
  });
}

async function createSplit(prisma: PrismaClient, user: Pick<User, "id" | "city">, data: ReturnType<typeof computeSplit>, group?: { circleId: string | null; memberIds: string[] }) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.split.create({ data: { ...data, currency: currencyOf(user.city).code, code: newInviteCode(), userId: user.id, ...group } });
    } catch (err) {
      if (attempt < 4 && err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
}

/** "Forget that my brother lives in Alex": memories whose words all appear in what they said. */
async function forget(ctx: Ctx, a: AppAction): Promise<One> {
  const { lang } = ctx;
  const want = foldName(a.text ?? a.name ?? "").split(" ").filter((w) => w.length >= 2);
  if (!want.length) return { card: card(lang, a.kind, "failed", LABEL.nothingToForget(lang), "/memories") };
  const all = await ctx.prisma.memory.findMany({ where: { userId: ctx.user.id }, orderBy: { createdAt: "desc" }, take: 500 });
  const score = (m: (typeof all)[number]) => {
    const words = new Set(foldName(`${m.subject} ${m.content}`).split(" "));
    return want.filter((w) => words.has(w) || [...words].some((x) => x.length >= 3 && (x.includes(w) || w.includes(x)))).length / want.length;
  };
  const hits = all.map((m) => ({ m, s: score(m) })).filter((x) => x.s >= 0.6).sort((x, y) => y.s - x.s).slice(0, 5).map((x) => x.m);
  if (!hits.length) return { card: card(lang, a.kind, "failed", LABEL.nothingToForget(lang), "/memories") };
  await ctx.prisma.memory.deleteMany({ where: { id: { in: hits.map((m) => m.id) }, userId: ctx.user.id } });
  return {
    card: card(lang, a.kind, "done", LABEL.forgot(lang, hits.length), "/memories", undefined, {
      kind: "memories",
      memories: hits.map((m) => ({ kind: m.kind, subject: m.subject, content: m.content, createdAt: m.createdAt.toISOString() })),
    }),
  };
}

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** Server-side settings from the chat. Language and theme live on the phone: those open Settings. */
async function changeSetting(ctx: Ctx, a: AppAction): Promise<One> {
  const { lang, user } = ctx;
  const value = (a.text ?? "").trim();
  const bad = (): One => ({ card: card(lang, a.kind, "failed", LABEL.badSetting(lang), "/settings") });
  const data: Prisma.UserUpdateInput = {};
  const old: Extract<StoredCardUndo, { kind: "user" }>["data"] = {};
  let what = "";
  switch (a.setting) {
    case "name":
      if (!value || value.length > 60) return bad();
      data.name = value;
      old.name = user.name;
      what = lang === "english" ? `I'll call you ${value}` : `هناديك ${value}`;
      break;
    case "wake_time":
    case "sleep_time": {
      const m = HHMM.exec(value);
      if (!m) return bad();
      const hhmm = `${m[1]!.padStart(2, "0")}:${m[2]}`;
      if (a.setting === "wake_time") {
        data.wakeTime = hhmm;
        old.wakeTime = user.wakeTime;
        what = lang === "english" ? `you wake at ${hhmm}` : `بتصحى ${hhmm}`;
      } else {
        data.sleepTime = hhmm;
        old.sleepTime = user.sleepTime;
        what = lang === "english" ? `you sleep at ${hhmm}` : `بتنام ${hhmm}`;
      }
      break;
    }
    case "instapay": {
      const link = parseInstapayLink(value);
      if (!link) return bad();
      data.instapayLink = link;
      old.instapayLink = user.instapayLink;
      what = lang === "english" ? "InstaPay link saved" : "لينك إنستاباي اتحفظ";
      break;
    }
    case "address": {
      const g = /^(f|female|woman|girl|انثى|أنثى|ست|بنت|مؤنث|feminine)$/i.test(value) ? "female" : /^(m|male|man|boy|ذكر|راجل|ولد|مذكر|masculine)$/i.test(value) ? "male" : null;
      if (!g) return bad();
      data.gender = g;
      old.gender = user.gender;
      what = lang === "english" ? (g === "female" ? "I'll talk to you as a woman" : "I'll talk to you as a man") : g === "female" ? "هكلمك بصيغة المؤنث" : "هكلمك بصيغة المذكر";
      break;
    }
    case "tone": {
      if (!["playful", "balanced", "calm"].includes(value)) return bad();
      data.tone = value as "playful" | "balanced" | "calm";
      old.tone = user.tone;
      what = lang === "english" ? `tone: ${value}` : `الأسلوب: ${{ playful: "هزار", balanced: "متوازن", calm: "هادي" }[value]}`;
      break;
    }
    case "checkins": {
      const v = value === "2" || value === "h2" ? "h2" : value === "4" || value === "h4" ? "h4" : value === "off" ? "off" : null;
      if (!v) return bad();
      data.checkinIntervalH = v;
      data.ignoredCheckins = 0;
      old.checkinIntervalH = user.checkinIntervalH;
      what = lang === "english" ? (v === "off" ? "no check-ins" : `check-ins every ${v.slice(1)} hours`) : v === "off" ? "من غير سؤال عليك" : `هسأل عليك كل ${v.slice(1)} ساعات`;
      break;
    }
    default:
      return { card: card(lang, a.kind, "done", LABEL.open(lang, lang === "english" ? "Settings" : "الإعدادات"), "/settings") };
  }
  await ctx.prisma.user.update({ where: { id: user.id }, data });
  Object.assign(ctx.user, data);
  return { card: card(lang, a.kind, "done", LABEL.setting(lang, what), "/settings", undefined, { kind: "user", data: old }) };
}

type StoredCardUndo = NonNullable<StoredCard["undo"]>;

/**
 * The user's OK on a pending card added in this batch. Runs the stored payload, never model
 * text. Returns null for payload kinds handled by ./actions.ts.
 */
export async function runMorePending(prisma: PrismaClient, user: User, c: StoredCard, now: Date): Promise<{ card: StoredCard; notices: Notice[] } | null> {
  const p = c.payload;
  if (!p) return null;
  const { lang } = c;
  const done = (label: string, route: string | null = c.route, undo?: StoredCardUndo): { card: StoredCard; notices: Notice[] } => {
    const { payload: _drop, ...rest } = c;
    return { card: { ...rest, status: "done", label, route, ...(undo ? { undo } : {}) }, notices: [] };
  };
  const fail = (label: string): { card: StoredCard; notices: Notice[] } => {
    const { payload: _drop, ...rest } = c;
    return { card: { ...rest, status: "failed", label }, notices: [] };
  };
  const withNotices = (r: { card: StoredCard; notices: Notice[] }, notices: Notice[]) => ({ ...r, notices: notices.filter((n) => n.userId !== user.id) });
  switch (p.kind) {
    case "split_circle": {
      const members = await prisma.circleMember.findMany({ where: { circleId: p.circleId }, include: { user: { select: { name: true } } }, orderBy: { joinedAt: "asc" }, take: MAX_SPLIT_PEOPLE });
      if (!members.some((m) => m.userId === user.id)) return fail(LABEL.notFound(lang, "circle"));
      const others = members.filter((m) => m.userId !== user.id);
      if (!others.length) return fail(LABEL.failed(lang));
      const me = { name: user.name ?? (lang === "english" ? "Me" : "أنا"), user_id: user.id };
      const people = [me, ...others.map((m, i) => ({ name: (m.user.name ?? (lang === "english" ? `Person ${i + 2}` : `شخص ${i + 2}`)).slice(0, 40), user_id: m.userId }))];
      const input = SplitInput.safeParse({ title: p.title, people, subtotal: p.amount, service_pct: 0, vat_pct: 0, paid_by: 0, circle_id: p.circleId });
      if (!input.success) return fail(LABEL.failed(lang));
      const group = await groupOf(prisma, user.id, input.data);
      if (!group) return fail(LABEL.notFound(lang, "circle"));
      const row = await createSplit(prisma, user, computeSplit(group.input), { circleId: group.circleId, memberIds: group.memberIds });
      const notices = await tellMembers(prisma, row, user, now);
      await prisma.event.create({ data: { userId: user.id, name: "split_created", propsJson: { via: "chat", people: people.length, circle: true } } });
      const share = Math.round(p.amount / people.length);
      return withNotices(done(LABEL.splitMade(lang, p.amount, people.length, share), `/split/${row.id}`), notices);
    }
    case "homework_batch": {
      const items = p.items.map((i) => ({ title: i.title, subject: i.subject, dueAt: i.dueAt ? new Date(i.dueAt) : null, note: null, reward: null }));
      const made = await assignHomeworkBatch(prisma, { circleId: p.circleId, assignerId: user.id, assigneeId: p.assigneeId, items }, now);
      if (made === "not_members") return fail(LABEL.notFound(lang, "person"));
      if (made === "too_many") return fail(LABEL.tooMany(lang));
      await prisma.event.create({ data: { userId: user.id, name: "forward_homework_sent", propsJson: { count: items.length } } });
      return withNotices(done(LABEL.homeworkBatchSent(lang, made.tasks[0]?.assignee.name ?? "?", made.tasks.length)), made.notices);
    }
    case "split_i_paid": {
      const row = await prisma.split.findFirst({ where: { id: p.splitId, memberIds: { has: user.id } } });
      const index = row ? (row.peopleJson as { user_id?: string | null }[]).findIndex((x) => x.user_id === user.id) : -1;
      if (!row || index < 0) return fail(LABEL.noSplit(lang));
      const marked = await markPaid(prisma, row, index, now, "member");
      return withNotices(done(LABEL.splitIPaid(lang), `/split/${row.id}`), marked?.notices ?? []);
    }
    case "delete_section": {
      const s = await prisma.moneySection.findFirst({ where: { id: p.sectionId, ownerId: user.id } });
      if (!s) return fail(LABEL.notFound(lang, "section"));
      await prisma.moneySection.delete({ where: { id: s.id } });
      return done(LABEL.sectionDeleted(lang, s.name), "/money");
    }
    case "delete_tracker": {
      const t = await prisma.tracker.findFirst({ where: { id: p.trackerId, userId: user.id } });
      if (!t) return fail(LABEL.notFound(lang, "tracker"));
      await prisma.tracker.delete({ where: { id: t.id } });
      return done(LABEL.trackerDeleted(lang, trackerLabel(kindOf(t), t.name, lang)), "/trackers");
    }
    case "daftar_add": {
      // Both people must still share that circle.
      if (p.circleId && p.otherUserId && (await prisma.circleMember.count({ where: { circleId: p.circleId, userId: { in: [user.id, p.otherUserId] } } })) !== 2) return fail(LABEL.notFound(lang, "person"));
      const e = await createEntry(prisma, user, { circleId: p.circleId, otherName: p.otherName, otherUserId: p.otherUserId, direction: p.direction, amount: p.amount, note: p.note }, now);
      // createEntry tells a circle member in their chat.
      return done(LABEL.daftarMade(lang, p.otherName, p.amount, p.direction, Boolean(e.other)), `/daftar/${e.code}`);
    }
    case "daftar_settle":
    case "daftar_cancel":
    case "daftar_answer": {
      const e = await prisma.daftarEntry.findFirst({ where: { id: p.entryId, OR: [{ creatorId: user.id }, { otherUserId: user.id }] }, include: daftarPeople });
      if (!e) return fail(LABEL.noDaftar(lang));
      const role = e.creatorId === user.id ? "creator" : "other";
      const name = role === "creator" ? e.other?.name ?? e.otherName : e.creator.name ?? "?";
      if (p.kind === "daftar_settle") {
        const after = canSettle(e.status) ? await settleDaftar(prisma, e.id, user.id, now) : null;
        if (!after) return fail(LABEL.notAllowed(lang));
        // settle() tells the other person in their chat.
        return done(LABEL.daftarSettled(lang, name, Number(e.amount)));
      }
      if (p.kind === "daftar_cancel") {
        if (!canCancelDaftar(e.status, role) || !(await cancelEntry(prisma, e.id))) return fail(LABEL.notAllowed(lang));
        return done(LABEL.daftarCancelled(lang, name));
      }
      if (p.kind !== "daftar_answer") return fail(LABEL.failed(lang));
      const after = canRespondDaftar(e.status, role) ? await respondDaftar(prisma, e.id, p.answer, "app", now) : null;
      if (!after) return fail(LABEL.notAllowed(lang));
      // respond() tells the creator in their chat.
      return done(LABEL.daftarAnswered(lang, name, p.answer === "confirm"));
    }
    case "task_answer":
    case "task_nudge":
    case "task_cancel":
    case "homework_submit":
    case "homework_review": {
      const t = await prisma.circleTask.findFirst({ where: { id: p.taskId, OR: [{ assignerId: user.id }, { assigneeId: user.id }] }, include: taskPeople });
      if (!t) return fail(LABEL.noTask(lang));
      const role = roleOf(t, user.id);
      const other = role === "assigner" ? t.assignee.name ?? "?" : t.assigner.name ?? "?";
      let outcome: { notices: Notice[] } | null = null;
      let label = "";
      if (p.kind === "task_answer") {
        outcome = canRespondTask(t.status, role) ? await respondTask(prisma, t.id, p.answer, now) : null;
        label = LABEL.taskAnswered(lang, t.title, p.answer === "accept");
      } else if (p.kind === "task_nudge") {
        outcome = canNudgeTask(t, role, now) ? await nudgeTask(prisma, t, now) : null;
        label = LABEL.nudged(lang, other);
      } else if (p.kind === "task_cancel") {
        outcome = canCancelTask(t.status, role) ? await cancelTask(prisma, t.id, now) : null;
        label = LABEL.taskCancelled(lang, t.title);
      } else if (p.kind === "homework_submit") {
        outcome = role === "assignee" && t.homework ? await submitHomework(prisma, t.id, p.text, now) : null;
        label = LABEL.submitted(lang, t.title);
      } else if (p.kind === "homework_review") {
        outcome = role === "assigner" ? await reviewHomework(prisma, t.id, p.verdict, p.note, now) : null;
        label = LABEL.reviewed(lang, other, p.verdict === "approved");
      }
      if (!outcome) return fail(LABEL.notAllowed(lang));
      return withNotices(done(label), outcome.notices);
    }
    case "checkin": {
      const posted = await postCheckin(prisma, p.circleId, user, CheckinKind.parse(p.checkinKind), p.note, now);
      if (!posted) return fail(LABEL.notFound(lang, "circle"));
      const circle = await prisma.circle.findUnique({ where: { id: p.circleId }, select: { name: true } });
      return withNotices(done(LABEL.checkinSent(lang, circle?.name ?? "", checkinWords(lang, p.checkinKind, p.note))), posted.notices);
    }
    case "ask_checkin": {
      const asked = await askCheckin(prisma, p.circleId, user, p.userId, now);
      if (!asked) return fail(LABEL.notFound(lang, "person"));
      if (asked === "too_soon") return fail(LABEL.tooSoon(lang));
      const target = await prisma.user.findUnique({ where: { id: p.userId }, select: { name: true } });
      return withNotices(done(LABEL.askCheckinSent(lang, target?.name ?? "?")), asked.notices);
    }
    case "leave_circle": {
      const circle = await prisma.circle.findFirst({ where: { id: p.circleId, members: { some: { userId: user.id } } }, select: { name: true } });
      if (!circle) return fail(LABEL.notFound(lang, "circle"));
      await removeMember(prisma, p.circleId, user.id, now);
      return done(LABEL.left(lang, circle.name), "/circles");
    }
    case "list_trip":
      return confirmTrip(prisma, user, c, p.listId, now);
    case "iftar": {
      const made = await inviteToIftar(prisma, p.circleId, user, p.on, p.note, now);
      if (!made) return fail(LABEL.notFound(lang, "circle"));
      const circle = await prisma.circle.findUnique({ where: { id: p.circleId }, select: { name: true } });
      return withNotices(done(LABEL.iftarSent(lang, circle?.name ?? "")), made.notices);
    }
    default:
      return null;
  }
}

/**
 * A private debt item the user just closed in chat ("حسن رجعلي الفلوس") that also sits in the
 * shared Daftar with that person: offer to settle the shared entry too (a waiting card, since the
 * other person is told). Nothing when there is no single matching open entry.
 */
export async function settleCards(prisma: PrismaClient, user: User, debts: { person: string; amount: number | null }[], lang: ReplyLang, now: Date): Promise<StoredCard[]> {
  const out: StoredCard[] = [];
  const ctx = { prisma, user, lang, now, data: { circles: [] }, requireSubscription: false } as unknown as Ctx;
  for (const d of debts.slice(0, 2)) {
    const a = { kind: "daftar_settle", person: d.person } as AppAction;
    const e = (d.amount ? await findEntry(ctx, { ...a, amount: d.amount } as AppAction) : null) ?? (await findEntry(ctx, a));
    if (!e || !canSettle(e.status)) continue;
    const name = e.creatorId === user.id ? e.other?.name ?? e.otherName : e.creator.name ?? "?";
    out.push(card(lang, "daftar_settle", "pending", LABEL.daftarSettleAsk(lang, name, Number(e.amount)), `/daftar/${e.code}`, { kind: "daftar_settle", entryId: e.id }));
  }
  return out;
}
