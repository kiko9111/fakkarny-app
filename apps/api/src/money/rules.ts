import { BUDGET_WARN_AT } from "@fakkarni/shared";
import { localToUtc, toLocalIso } from "../lib/time";
import type { ReplyLang } from "../pipeline/rules";
import { normalize } from "../trackers/match";

/** Pure rules for the wider Daftar: months, splits, budgets, chat logging and the month gift. */

/** "2026-11" for this instant in the user's time zone. */
export const monthOf = (at: Date, tz: string) => toLocalIso(at, tz).slice(0, 7);

/** The month before "2026-01" is "2025-12". */
export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
const nextMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

/** [start, end) of a local month as UTC instants. */
export function monthRange(month: string, tz: string): { from: Date; to: Date } {
  return { from: localToUtc(`${month}-01T00:00`, tz), to: localToUtc(`${nextMonth(month)}-01T00:00`, tz) };
}

export interface SplitEntry {
  payerId: string;
  amount: number;
  /** User ids it is split among; empty = only the payer (no one owes anything). */
  split: string[];
}

/** Each person's balance: what they paid minus their even share. Positive = is owed money. */
export function balances(entries: readonly SplitEntry[]): Map<string, number> {
  const out = new Map<string, number>();
  const add = (id: string, n: number) => out.set(id, round2((out.get(id) ?? 0) + n));
  for (const e of entries) {
    const among = e.split.length ? e.split : [e.payerId];
    add(e.payerId, e.amount);
    for (const id of among) add(id, -e.amount / among.length);
  }
  return out;
}

/** The caller's own share of these entries (what they would pay if everything were even). */
export function shareOf(entries: readonly SplitEntry[], userId: string): number {
  return round2(entries.reduce((n, e) => n + ((e.split.length ? e.split : [e.payerId]).includes(userId) ? e.amount / (e.split.length || 1) : 0), 0));
}

/** Fewest "X pays Y" lines that make every balance zero (greedy: biggest debtor pays biggest creditor). */
export function settleUp(bal: Map<string, number>): { from: string; to: string; amount: number }[] {
  const debt = [...bal].filter(([, v]) => v < -0.009).map(([id, v]) => ({ id, v: -v }));
  const cred = [...bal].filter(([, v]) => v > 0.009).map(([id, v]) => ({ id, v }));
  const out: { from: string; to: string; amount: number }[] = [];
  debt.sort((a, b) => b.v - a.v);
  cred.sort((a, b) => b.v - a.v);
  let i = 0;
  let j = 0;
  while (i < debt.length && j < cred.length) {
    const pay = round2(Math.min(debt[i]!.v, cred[j]!.v));
    if (pay > 0) out.push({ from: debt[i]!.id, to: cred[j]!.id, amount: pay });
    debt[i]!.v -= pay;
    cred[j]!.v -= pay;
    if (debt[i]!.v < 0.01) i++;
    if (cred[j]!.v < 0.01) j++;
  }
  return out;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** The budget line this entry crossed: 80% first, then 100%. Null when nothing new was crossed. */
export function budgetCrossed(before: number, after: number, budget: number | null): 80 | 100 | null {
  if (!budget || budget <= 0) return null;
  if (before < budget && after >= budget) return 100;
  if (before < budget * BUDGET_WARN_AT && after >= budget * BUDGET_WARN_AT) return 80;
  return null;
}

/** Zaki's warning near a budget: kind and honest, never scolding. */
export function budgetLine(lang: ReplyLang, section: string, total: number, budget: number, level: 80 | 100): string {
  const left = Math.max(0, budget - total);
  if (lang === "english") {
    return level === 100
      ? `Heads up: “${section}” reached its budget for this month (${num(total)} of ${num(budget)}). No stress, just so you know where things are 💛`
      : `Just so you know: “${section}” is at ${num(total)} of ${num(budget)} this month. ${num(left)} left 🌱`;
  }
  return level === 100
    ? `خلّي بالك: «${section}» وصل لميزانية الشهر (${num(total)} من ${num(budget)}). مفيش قلق، بس عشان تبقى عارف 💛`
    : `للعلم بس: «${section}» وصل ${num(total)} من ${num(budget)} الشهر ده. فاضل ${num(left)} 🌱`;
}

/** What Zaki says after logging an amount from chat. */
export function loggedMoneyLine(lang: ReplyLang, section: string, amount: number, monthTotal: number, kind: "expense" | "income"): string {
  if (lang === "english") return kind === "income" ? `Logged EGP ${num(amount)} in “${section}” 🌟` : `Logged EGP ${num(amount)} in “${section}”. This month so far: ${num(monthTotal)}.`;
  return kind === "income" ? `سجّلت ${num(amount)} جنيه في «${section}» 🌟` : `سجّلت ${num(amount)} جنيه في «${section}». الشهر ده لحد دلوقتي: ${num(monthTotal)}.`;
}

export interface MoneyHit {
  kind: "expense" | "income";
  amount: number;
  /** The words after the amount ("بنزين"), used to pick the section and kept as the note. */
  note: string | null;
}

const NOT_A_LOG = /[?؟]|فكرني|فكريني|remind|بكره|tomorrow|هدفع|هصرف|will |going to|gonna|عايز|عاوز|محتاج|لازم|need to|want to|should|مش |ما |لسه|نسيت|\bnot\b|n't|never|forgot|لو |\bif\b/;
const DEBT_WORDS = /سلف|استلف|عليا|ليا |عليه|\bowe|\blent\b|borrow|رجع|\bback\b|(?:^|\s)ل[ا-ي]+ (?:\d|ب)|\bto [a-z]+$/;
const EXPENSE = /(?:^|\s)(?:دفعت|صرفت|اشتريت|جبت|spent|paid|bought)(?=\s)/;
const INCOME = /(?:^|\s)(?:قبضت|اتقبضت|خدت مرتبي|نزل المرتب|جالي|كسبت|got paid|earned|received)(?=\s)/;
const FILLER = /^(?:في|علي|على|عالـ?|ع|ب|بـ|on|for|in|at|the|a|جنيه|ج|egp|le|pounds?)\s+/;

/**
 * "دفعت 300 بنزين" → expense 300 "بنزين"; "قبضت 5000" → income 5000. Strict on purpose: plans,
 * questions, negations and debts ("دفعت لأحمد 200") fall through to the model.
 */
export function matchMoneyLog(text: string): MoneyHit | null {
  const t = normalize(text);
  if (t.length > 80 || t.split(/\s+/).length > 9 || NOT_A_LOG.test(t) || DEBT_WORDS.test(t)) return null;
  const kind = INCOME.test(t) ? "income" : EXPENSE.test(t) ? "expense" : null;
  if (!kind) return null;
  const m = t.match(/(\d+(?:\.\d+)?)\s*(?:k|الف|ألف)?/);
  if (!m) return null;
  let amount = Number(m[1]);
  if (/\d\s*(?:k|الف)/.test(m[0])) amount *= 1000;
  if (!(amount > 0 && amount <= 100_000_000)) return null;
  let rest = t.slice((m.index ?? 0) + m[0].length).trim();
  for (let n = 0; n < 3; n++) rest = rest.replace(FILLER, "");
  rest = rest.replace(/[.!،,]+$/, "").trim();
  return { kind, amount, note: rest && rest.length <= 40 ? rest : null };
}

export interface SectionPick {
  id: string;
  name: string;
  kind: string;
}

/**
 * Which section an amount from chat goes to: one whose name is in the message, else the one
 * this note went to last time, else the only section of that kind. Null = ask nothing, let the
 * model answer (it can still tell the user how to add sections).
 */
export function pickSection(sections: readonly SectionPick[], hit: MoneyHit, text: string, lastSectionForNote: string | null): SectionPick | null {
  const ofKind = sections.filter((s) => s.kind === hit.kind);
  const t = normalize(text);
  const named = ofKind.filter((s) => t.includes(normalize(s.name)));
  if (named.length === 1) return named[0]!;
  const remembered = lastSectionForNote ? ofKind.find((s) => s.id === lastSectionForNote) : undefined;
  if (remembered) return remembered;
  // The only section of that kind, when the message names nothing else ("قبضت 9000").
  return ofKind.length === 1 && !hit.note ? ofKind[0]! : null;
}

export interface GiftInput {
  month: string;
  expense: number;
  income: number;
  /** Expense sections with their totals and budgets. */
  sections: { name: string; total: number; budget: number | null }[];
  /** Same numbers for the month before, when there was one. */
  previousExpense: number | null;
}

const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The end-of-month "gift": a short, warm look back. Templates only, nothing invented. */
export function giftLines(lang: ReplyLang, g: GiftInput): string[] {
  const ar = lang !== "english";
  const name = (ar ? MONTHS_AR : MONTHS_EN)[Number(g.month.slice(5)) - 1]!;
  const lines = [ar ? `🎁 هدية آخر الشهر من زكي: ملخّص ${name}` : `🎁 Zaki's end-of-month gift: your ${name} in a nutshell`];
  if (g.expense > 0) lines.push(ar ? `صرفت ${num(g.expense)} جنيه في الشهر.` : `You spent EGP ${num(g.expense)} this month.`);
  if (g.income > 0) lines.push(ar ? `ودخلك ${num(g.income)} جنيه.` : `Your income was EGP ${num(g.income)}.`);
  if (g.income > 0 && g.income > g.expense) lines.push(ar ? `يعني فضل معاك ${num(g.income - g.expense)} 🌟 برافو عليك!` : `That leaves EGP ${num(g.income - g.expense)} 🌟 Well done!`);
  const top = [...g.sections].filter((s) => s.total > 0).sort((a, b) => b.total - a.total)[0];
  if (top) lines.push(ar ? `أكبر قسم: «${top.name}» بـ${num(top.total)}.` : `Biggest section: “${top.name}” at ${num(top.total)}.`);
  const budgeted = g.sections.filter((s) => s.budget);
  const under = budgeted.filter((s) => s.total <= s.budget!);
  if (budgeted.length) {
    lines.push(
      under.length === budgeted.length
        ? ar ? `كل الأقسام فضلت جوه الميزانية 👏` : `Every section stayed within budget 👏`
        : ar ? `${under.length} من ${budgeted.length} أقسام فضلت جوه الميزانية.` : `${under.length} of ${budgeted.length} sections stayed within budget.`,
    );
  }
  if (g.previousExpense && g.expense > 0 && g.expense < g.previousExpense) {
    lines.push(ar ? `وصرفت أقل من الشهر اللي قبله بـ${num(g.previousExpense - g.expense)} 💪` : `And EGP ${num(g.previousExpense - g.expense)} less than the month before 💪`);
  }
  lines.push(ar ? `شهر جديد، بداية جديدة. أنا معاك 💛` : `New month, fresh start. I'm with you 💛`);
  return lines;
}

/** The gift goes out on the 1st, late morning local time, once. */
export const GIFT_FROM_HOUR = 10;
export const GIFT_UNTIL_HOUR = 13;
