// Pure helpers of the Daftar tab's layout (tested in layout.test.ts; no react-native here).
import { isPaid, myMember, phaseOf, type Gameya, type Split } from "@fakkarni/shared";

export type DaftarPart = "spend" | "people" | "split";

/** The part a link asks for (`/money?part=people`), or null when it names none. */
export function partFrom(value: string | string[] | undefined): DaftarPart | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "spend" || v === "people" || v === "split" ? v : null;
}

interface SectionLike {
  id: string;
  circle_id?: string | null;
}

/** More sections than this and the Spending list itself is the place to pick one. */
export const PICK_LIMIT = 6;

/**
 * Where "+ › Money in or out" goes. An amount is typed on a section's own screen, so: no section
 * yet → make the first one; one → open it; a few → pick one from a short sheet; many → the
 * Spending list, which is that picker already.
 */
export function spendTarget<T extends SectionLike>(sections: readonly T[] | null | undefined): { go: "new" } | { go: "open"; id: string } | { go: "pick"; sections: T[] } | { go: "list" } {
  const all = sections ?? [];
  if (all.length === 0) return { go: "new" };
  if (all.length === 1) return { go: "open", id: all[0]!.id };
  if (all.length > PICK_LIMIT) return { go: "list" };
  // Her own sections first, shared books after, as the Spending list shows them.
  return { go: "pick", sections: [...all.filter((s) => !s.circle_id), ...all.filter((s) => s.circle_id)] };
}

interface PocketLike {
  circle_id: string;
  child_id: string;
  child_name: string | null;
  parent_id: string;
  parent_name: string | null;
  role: "child" | "parent";
  balance: number;
}

export interface PocketRow {
  key: string;
  /** The other person: the child for a parent, the parent for a child. Null = no name set. */
  name: string | null;
  /** "parent": the caller owes it. "child": it is owed to the caller. */
  role: "child" | "parent";
  owed: number;
}

/**
 * The People part's pocket money rows: one per child for a parent (every circle's records of
 * that child added up), one per parent for a child. Who is still owed comes first.
 */
export function pocketRows(accounts: readonly PocketLike[]): PocketRow[] {
  const rows = new Map<string, PocketRow>();
  for (const a of accounts) {
    const asParent = a.role === "parent";
    const key = `${a.role}:${asParent ? a.child_id : a.parent_id}`;
    const row = rows.get(key);
    const owed = Math.max(0, a.balance);
    if (row) {
      row.owed += owed;
      row.name ??= asParent ? a.child_name : a.parent_name;
    } else rows.set(key, { key, name: asParent ? a.child_name : a.parent_name, role: a.role, owed });
  }
  return [...rows.values()].sort((a, b) => Number(b.owed > 0) - Number(a.owed > 0) || (a.role === b.role ? 0 : a.role === "parent" ? -1 : 1) || (a.name ?? "").localeCompare(b.name ?? ""));
}

/** My unpaid share of a bill someone else split (the same rule as Today's inbox). */
function openShare(s: Pick<Split, "mine" | "me" | "paid_by" | "people">): number {
  if (s.mine !== false || s.me == null || s.paid_by === null || s.me === s.paid_by) return 0;
  const row = s.people[s.me];
  return row && !row.paid ? Math.max(0, row.share) : 0;
}

/**
 * The People part's three amounts. Owed to you and You owe count the shared entries still open
 * AND the private notes (the strip used to leave the notes out while they sat right under it);
 * Due is what this month asks of the reader: a running gam'eya's round not paid yet, and shares
 * of bills other people split.
 */
export function peopleTotals(input: {
  shared: { owedToMe: number; iOwe: number };
  notesOwedToMe: number;
  notesIOwe: number;
  gameyas: readonly Gameya[];
  splits: readonly Pick<Split, "mine" | "me" | "paid_by" | "people">[];
}): { owedToMe: number; iOwe: number; due: number } {
  let due = 0;
  for (const g of input.gameyas) {
    if (phaseOf(g) !== "running") continue;
    const me = myMember(g);
    if (me && !isPaid(g, me.id, g.round)) due += g.amount;
  }
  for (const s of input.splits) due += openShare(s);
  return { owedToMe: input.shared.owedToMe + input.notesOwedToMe, iOwe: input.shared.iOwe + input.notesIOwe, due };
}

/** The Splits part's three numbers: bills still open, what the reader owes on others' bills, what is owed on bills the reader paid. */
export function splitTotals(splits: readonly Pick<Split, "mine" | "me" | "paid_by" | "people">[]): { open: number; iOwe: number; owedToMe: number } {
  let open = 0;
  let iOwe = 0;
  let owedToMe = 0;
  for (const s of splits) {
    if (s.paid_by === null) continue;
    const left = s.people.reduce((n, p, i) => (i === s.paid_by || p.paid ? n : n + Math.max(0, p.share)), 0);
    if (left > 0) open += 1;
    if (s.mine === false) iOwe += openShare(s);
    // On the reader's own split the creator is the first person: what is left is owed to them only when they paid the bill.
    else if (s.paid_by === 0) owedToMe += left;
  }
  return { open, iOwe, owedToMe };
}

/** What one split's row says first: the reader's side of it. */
export function splitSide(s: Pick<Split, "mine" | "me" | "paid_by" | "people">): { says: "you_owe" | "owed" | "settled" | "none"; amount: number } {
  if (s.paid_by === null) return { says: "none", amount: 0 };
  const mine = openShare(s);
  if (mine > 0) return { says: "you_owe", amount: mine };
  const left = s.people.reduce((n, p, i) => (i === s.paid_by || p.paid ? n : n + Math.max(0, p.share)), 0);
  if (s.mine !== false && s.paid_by === 0 && left > 0) return { says: "owed", amount: left };
  return { says: left > 0 ? "none" : "settled", amount: 0 };
}

/** Which row of the "+" sheet comes first in each part. */
export const FIRST_ACTION: Record<DaftarPart, string> = { spend: "money", people: "debt", split: "split" };
/** The open part's action first; the rest keep their order. */
export function partFirst<A extends { key: string }>(actions: readonly A[], part: DaftarPart): A[] {
  const first = actions.find((a) => a.key === FIRST_ACTION[part]);
  return first ? [first, ...actions.filter((a) => a !== first)] : [...actions];
}
