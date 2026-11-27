// Pure helpers of the Daftar tab's layout (tested in layout.test.ts; no react-native here).

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
