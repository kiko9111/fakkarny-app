import type { Feature } from "../lib/unlock";

/**
 * What the "+" beside the composer offers (pure; the sheet is chat/PlusMenu.tsx). A row either
 * opens a screen, asks which circle first, or puts a starter in the composer.
 */

export type PlusKey = "receipt" | "split" | "homework" | "ask" | "list" | "remind";

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

export function plusActions({ photos, lists, circles }: PlusInput): PlusRow[] {
  const rows: PlusRow[] = [{ key: "remind", place: null, step: { compose: "remind" } }];
  if (lists) rows.push({ key: "list", place: "today", step: { go: "/list" } });
  // With no circle yet, asking someone starts by making one.
  rows.push({ key: "ask", place: "people", step: toCircle(withPeople(circles), "/task/new") ?? { go: "/circle/new" } });
  const homework = toCircle(withPeople(circles.filter((c) => c.kind === "family")), "/homework/plan");
  if (homework) rows.push({ key: "homework", place: "people", step: homework });
  rows.push({ key: "split", place: "daftar", step: { go: "/split/new" } });
  if (photos) rows.push({ key: "receipt", place: "daftar", step: { go: "/receipt" } });
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
