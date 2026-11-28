import type { Feature } from "../lib/unlock";

/**
 * What the "+" beside the composer offers (pure; the sheet is chat/PlusMenu.tsx). A row either
 * opens a screen, asks which circle first, or puts a starter in the composer.
 */

export type PlusKey = "receipt" | "split" | "homework" | "medicine" | "ask" | "list" | "remind" | "forward";

export interface PlusCircle {
  id: string;
  name: string;
  kind: string;
  member_count: number;
}

export type PlusStep =
  | { go: string }
  /** More than one circle fits: the sheet asks which. */
  | { pick: { id: string; name: string; route: string }[] }
  | { compose: "remind" };

export interface PlusRow {
  key: PlusKey;
  /** The place the row belongs to: opened with it for a user who has not opened it yet. */
  place: Feature | null;
  step: PlusStep;
}

export interface PlusInput {
  /** This build has the photo picker. */
  photos: boolean;
  /** The server has answered GET /lists (an older server has no lists). */
  lists: boolean;
  /** The lists she has, when known: "Add to a list" opens the only one, or starts the first. */
  listIds?: readonly string[];
  /** The server has answered GET /care (an older server has no care circles). */
  care?: boolean;
  circles: readonly PlusCircle[];
}

const withId = (path: string, id: string) => `${path}?circle=${encodeURIComponent(id)}`;

/** Circles with someone else in them when there are any; otherwise all of them. */
function withPeople(circles: readonly PlusCircle[]): readonly PlusCircle[] {
  const shared = circles.filter((c) => c.member_count > 1);
  return shared.length ? shared : circles;
}

/** One circle goes straight there; several ask which. Null with none. */
function toCircle(circles: readonly PlusCircle[], path: string): PlusStep | null {
  if (!circles.length) return null;
  if (circles.length === 1) return { go: withId(path, circles[0]!.id) };
  return { pick: circles.map((c) => ({ id: c.id, name: c.name, route: withId(path, c.id) })) };
}

/** "Add to a list": the only list opens (its add box is there), none starts one, several ask which. */
function toList(ids: readonly string[] | undefined): PlusStep {
  if (!ids) return { go: "/list" };
  if (ids.length === 0) return { go: "/list?new=1" };
  return { go: ids.length === 1 ? `/list/${encodeURIComponent(ids[0]!)}` : "/list" };
}

export function plusActions({ photos, lists, listIds, care, circles }: PlusInput): PlusRow[] {
  const rows: PlusRow[] = [{ key: "remind", place: null, step: { compose: "remind" } }];
  if (lists) rows.push({ key: "list", place: "today", step: toList(listIds) });
  // With no circle yet, asking someone starts by making one.
  rows.push({ key: "ask", place: "people", step: toCircle(withPeople(circles), "/task/new") ?? { go: "/circle/new" } });
  const homework = toCircle(withPeople(circles.filter((c) => c.kind === "family")), "/homework/plan");
  if (homework) rows.push({ key: "homework", place: "people", step: homework });
  // Medicine times live in a family circle (often a parent's, who may not have the app): any family circle fits.
  const medicine = care ? toCircle(circles.filter((c) => c.kind === "family"), "/care/new") : null;
  if (medicine) rows.push({ key: "medicine", place: "people", step: medicine });
  rows.push({ key: "split", place: "daftar", step: { go: "/split/new" } });
  if (photos) rows.push({ key: "receipt", place: "daftar", step: { go: "/receipt" } });
  // A message from WhatsApp, pasted (every phone; Android builds from 2026-11-27 can also share it straight to Zaki).
  rows.push({ key: "forward", place: null, step: { go: "/forward" } });
  return rows;
}

/** The composer after "Remind me": the starter, unless she has already typed something. */
export function withStarter(current: string, starter: string): string {
  return current.trim() ? current : starter;
}

/** Quick replies under the chat: a few, and none that only repeats a row of the "+". */
export function quickReplies(options: readonly string[], repeats: readonly string[], max = 2): string[] {
  const taken = new Set(repeats.map((r) => r.trim()));
  return options.filter((o) => !taken.has(o.trim())).slice(0, max);
}
