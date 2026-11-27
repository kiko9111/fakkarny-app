import { isPaid, monthOfRound, myMember, phaseOf, roundState, type Gameya } from "@fakkarni/shared";
import type { PrismaClient, User } from "../generated/prisma/client";
import type { ReplyLang } from "../pipeline/rules";
import type { Notice } from "../proactive/notify";
import { card } from "../chat/actions";
import { LABEL, matchByName, type StoredCard } from "../chat/cards";
import type { Lang } from "../daftar/rules";
import { readGameyaMessage } from "./match";
import { monthName } from "./rules";
import { setPaid, toWireGameya, visibleGameyas, withBook, type BookRow } from "./store";

/**
 * The gam'eya from the chat, by rules (conversation step 1a‴): "دفعت الجمعية" records the user's
 * own payment for this month, "الدور على مين" tells where each gam'eya stands, "اعمل جمعية" opens
 * the form. No AI call. Messages that only look like it fall through to the model.
 */

const short = (lang: ReplyLang): Lang => (lang === "english" ? "en" : "ar");
const openCard = (lang: ReplyLang, g: Pick<Gameya, "id" | "name">) => card(lang, "open_screen", "done", LABEL.open(lang, g.name), `/gameya/${g.id}`);

/** One line on where a gam'eya stands, for the reader. */
export function standLine(lang: Lang, g: Gameya): string {
  const phase = phaseOf(g);
  const me = myMember(g);
  const mine = me ? (lang === "en" ? ` Your turn: #${me.turn}, ${monthName(me.month, lang)}${me.received ? " (received ✓)" : ""}.` : ` دورك رقم ${me.turn}، ${monthName(me.month, lang)}${me.received ? " (قبضت ✓)" : ""}.`) : "";
  if (phase === "before") return lang === "en" ? `«${g.name}» starts in ${monthName(g.start_month, lang)}.${mine}` : `«${g.name}» بتبدأ ${monthName(g.start_month, lang)}.${mine}`;
  if (phase === "over") return lang === "en" ? `«${g.name}» is complete 🎉` : `«${g.name}» خلصت 🎉`;
  const s = roundState(g, g.round);
  const month = monthName(monthOfRound(g.start_month, g.round), lang);
  const youPaid = me ? (isPaid(g, me.id, g.round) ? (lang === "en" ? " You paid ✓" : " إنت دفعت ✓") : lang === "en" ? " You haven't paid yet." : " لسه مدفعتش.") : "";
  return lang === "en"
    ? `«${g.name}», ${month} (turn ${g.round} of ${g.months}): the pot goes to ${s.receiver?.name ?? "—"}, ${s.paid.length} of ${g.members.length} paid.${youPaid}${mine}`
    : `«${g.name}»، ${month} (الدور ${g.round} من ${g.months}): القبض لـ ${s.receiver?.name ?? "—"}، دفع ${s.paid.length} من ${g.members.length}.${youPaid}${mine}`;
}

export async function gameyaFastPath(
  prisma: PrismaClient,
  user: User,
  text: string,
  lang: ReplyLang,
  now: Date,
): Promise<{ text: string; cards: StoredCard[]; notices: Notice[] } | null> {
  const intent = readGameyaMessage(text);
  if (!intent) return null;
  const l = short(lang);
  if (intent.kind === "new") {
    return {
      text: l === "en" ? "Let's set it up 🤝 Add the people, the amount and the turns, and I'll remind everyone before pay day." : "يلا نعملها 🤝 حط الناس والمبلغ والأدوار، وأنا هفكّر الكل قبل ميعاد القسط.",
      cards: [card(lang, "open_screen", "done", l === "en" ? "New gam'eya" : "جمعية جديدة", "/gameya/new")],
      notices: [],
    };
  }
  const rows: BookRow[] = await prisma.gameya.findMany({ where: visibleGameyas(user.id), include: withBook, orderBy: { createdAt: "desc" }, take: 20 });
  if (!rows.length) return null;
  const books = rows.map((r) => ({ row: r, g: toWireGameya(r, "", user.id, now) }));
  const named = intent.hint ? matchByName(books, intent.hint, (b) => [b.g.name]) : null;

  if (intent.kind === "status") {
    const shown = named ? [named] : books.filter((b) => phaseOf(b.g) !== "over").slice(0, 3);
    if (!shown.length) return { text: standLine(l, books[0]!.g), cards: [openCard(lang, books[0]!.g)], notices: [] };
    return { text: shown.map((b) => standLine(l, b.g)).join("\n"), cards: shown.map((b) => openCard(lang, b.g)), notices: [] };
  }

  // Paid: only gam'eyas running now where the user has a seat.
  const seated = books.filter((b) => phaseOf(b.g) === "running" && myMember(b.g));
  const target = named && seated.includes(named) ? named : seated.length === 1 ? seated[0]! : null;
  if (!target) {
    if (!seated.length) return null;
    return {
      text: l === "en" ? "Which gam'eya? Tap it and tick your payment there." : "أنهي جمعية؟ دوس عليها وعلّم إنك دفعت.",
      cards: seated.slice(0, 3).map((b) => openCard(lang, b.g)),
      notices: [],
    };
  }
  const me = myMember(target.g)!;
  const month = monthName(monthOfRound(target.g.start_month, target.g.round), l);
  if (isPaid(target.g, me.id, target.g.round))
    return { text: l === "en" ? `Your ${month} payment in «${target.g.name}» is already recorded ✓` : `قسط ${month} في «${target.g.name}» متسجّل إنك دفعته ✓`, cards: [openCard(lang, target.g)], notices: [] };
  const done = await setPaid(prisma, target.row, me.id, target.g.round, true, target.row.ownerId === user.id ? "owner" : "member", now);
  const g = done ? toWireGameya(done.row, "", user.id, now) : target.g;
  const s = roundState(g, g.round);
  const tail = target.row.ownerId === user.id ? "" : l === "en" ? ` I told ${target.row.owner.name ?? "the organizer"}.` : ` وقلت لـ ${target.row.owner.name ?? "المنظّم"}.`;
  return {
    text:
      l === "en"
        ? `Recorded: you paid ${month} in «${g.name}» ✅ ${s.paid.length} of ${g.members.length} paid.${tail}`
        : `سجّلت إنك دفعت قسط ${month} في «${g.name}» ✅ دفع ${s.paid.length} من ${g.members.length}.${tail}`,
    cards: [openCard(lang, g)],
    notices: done?.notices ?? [],
  };
}
