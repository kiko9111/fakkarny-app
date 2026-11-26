import { MAX_REWARD, type HomeworkDraft, type PocketAccount } from "@fakkarni/shared";
import { parseAmount } from "@/daftar/logic";

/** Pure helpers for the homework screens (no react-native here; tested in logic.test.ts). */

/** A typed reward: whole pounds, 1 to MAX_REWARD, Arabic or Latin digits. Null when it isn't one. */
export function parseReward(text: string): number | null {
  const n = parseAmount(text.trim());
  if (n === null || !Number.isInteger(n) || n < 1 || n > MAX_REWARD) return null;
  return n;
}

/** The phone's local calendar day, "YYYY-MM-DD". */
export function localDay(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Homework is due at school in the morning: 08:00 local on its day (the server reminds the evening before). */
export function dueAtFromDay(day: string | null): string | null {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y!, m! - 1, d!, 8, 0, 0).toISOString();
}

/** Practice questions as a homework note: numbered, one per line, within the note's 500 characters. */
export function practiceNote(questions: string[]): string {
  let out = "";
  for (const [n, q] of questions.entries()) {
    const line = `${n + 1}) ${q.trim()}`;
    if ((out ? out.length + 1 : 0) + line.length > 500) break;
    out = out ? `${out}\n${line}` : line;
  }
  return out;
}

/** A short homework title from what the parent typed (the practice homework's name). */
export function shortTitle(text: string, max = 60): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one;
}

/** Drafts to send: the ones the parent kept, with the chosen reward and subject. */
export function batchItems(drafts: HomeworkDraft[], removed: Set<number>, reward: number | null) {
  return drafts.flatMap((d, i) => (removed.has(i) ? [] : [{ title: d.title, subject: d.subject, due_at: dueAtFromDay(d.due_day), reward }]));
}

/** Records with something owed first, then by name. */
export function sortAccounts(list: PocketAccount[]): PocketAccount[] {
  return [...list].sort((a, b) => Number(b.balance > 0) - Number(a.balance > 0) || (a.role === "child" ? a.parent_name ?? "" : a.child_name ?? "").localeCompare(b.role === "child" ? b.parent_name ?? "" : b.child_name ?? ""));
}
