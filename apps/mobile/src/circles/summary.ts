import type { CheckinKind, CircleMember, CircleTask, HouseList, MoneySection, PocketAccount } from "@fakkarni/shared";

/** What the circle summary's tiles and "who's OK" card say. Pure (unit-tested; no react-native imports). */

const open = (t: Pick<CircleTask, "status">) => t.status === "pending" || t.status === "accepted";

/** Open requests (not homework), how many of them wait for the reader's yes, and homework still to do. */
export function taskCounts(tasks: readonly Pick<CircleTask, "status" | "role" | "homework">[]): { open: number; waiting: number; homework: number } {
  let tasksOpen = 0;
  let waiting = 0;
  let homework = 0;
  for (const t of tasks) {
    if (!open(t)) continue;
    if (t.homework) homework += 1;
    else {
      tasksOpen += 1;
      if (t.status === "pending" && t.role === "assignee") waiting += 1;
    }
  }
  return { open: tasksOpen, waiting, homework };
}

/** Pocket money still owed in this circle (whole EGP); null when nothing is known or owed. */
export function pocketOwed(accounts: readonly Pick<PocketAccount, "circle_id" | "balance">[] | null, circleId: string): number | null {
  if (!accounts) return null;
  const owed = accounts.filter((a) => a.circle_id === circleId && a.balance > 0).reduce((n, a) => n + a.balance, 0);
  return owed > 0 ? owed : null;
}

/** The circle's lists: everything still open, and the list to name (the fullest grocery one first). */
export function listSummary<L extends Pick<HouseList, "circle_id" | "place" | "open_count">>(lists: readonly L[] | null, circleId: string): { open: number; top: L | null } {
  const mine = (lists ?? []).filter((l) => l.circle_id === circleId);
  const top = [...mine].sort((a, b) => Number(b.place === "grocery") - Number(a.place === "grocery") || b.open_count - a.open_count)[0] ?? null;
  return { open: mine.reduce((n, l) => n + l.open_count, 0), top };
}

/** The circle's shared books this month: how many there are and the reader's share of them. */
export function bookSummary(sections: readonly Pick<MoneySection, "circle_id" | "my_share">[] | null, circleId: string): { books: number; share: number } {
  const books = (sections ?? []).filter((s) => s.circle_id === circleId);
  return { books: books.length, share: books.reduce((n, s) => n + s.my_share, 0) };
}

/** Whoever checked in last. */
export function latestCheckin<M extends Pick<CircleMember, "last_checkin">>(members: readonly M[]): M | null {
  let best: M | null = null;
  for (const m of members) if (m.last_checkin && (!best || m.last_checkin.at > best.last_checkin!.at)) best = m;
  return best;
}

/** The check-ins behind "More": the circle's order without the one on the main button. */
export const moreCheckins = (order: readonly CheckinKind[]): CheckinKind[] => order.filter((k) => k !== "ok");

/** Whole days left of a new circle's "everything open" trial (0 when over or none). */
export function trialDaysLeft(trialUntil: string | null | undefined, now: Date): number {
  return trialUntil ? Math.max(0, Math.ceil((new Date(trialUntil).getTime() - now.getTime()) / 86400_000)) : 0;
}
