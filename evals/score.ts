import { z } from "zod";
import type { FriendResponse } from "@fakkarni/shared";

/** One eval case (one line of evals/cases/*.jsonl). */
const ItemType = z.enum(["task", "reminder", "note", "list_item", "debt"]);
const LocalMinute = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
const LocalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const ExpectedItem = z.object({
  type: ItemType.optional(),
  type_any: z.array(ItemType).optional(),
  title_any: z.array(z.string()).optional(),
  due: LocalMinute.optional(),
  due_date: z.union([LocalDate, z.array(LocalDate)]).optional(),
  important: z.boolean().optional(),
  debt: z
    .object({ person_any: z.array(z.string()), amount: z.number(), direction: z.enum(["owed_to_me", "i_owe"]) })
    .optional(),
});

export const EvalCase = z.object({
  id: z.string(),
  tz: z.string().default("Africa/Cairo"),
  /** Local "now" in tz. Default: Thursday 2026-11-19 10:00. */
  now: LocalMinute.default("2026-11-19T10:00"),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string() })).default([]),
  open_items: z
    .array(
      z.object({
        id: z.uuid(),
        type: ItemType,
        title: z.string(),
        due_local: LocalMinute.optional(),
        debt_person: z.string().optional(),
        debt_amount: z.number().optional(),
        debt_direction: z.enum(["owed_to_me", "i_owe"]).optional(),
      }),
    )
    .default([]),
  message: z.string(),
  expect: z.object({
    /** How the USER writes. The friend answers arabic and franco in Arabic letters, english in English. */
    script: z.enum(["arabic", "franco", "english"]),
    items: z.array(ExpectedItem),
    updates: z.array(z.object({ id: z.uuid(), status: z.enum(["open", "done", "cancelled"]).optional(), due: LocalMinute.optional() })).optional(),
    memories_any: z.array(z.string()).optional(),
    crisis: z.boolean().optional(),
    list_ok: z.boolean().optional(),
    reply_any: z.array(z.string()).optional(),
    /** Substrings the reply must NOT contain (e.g. "بكرة" when it already asked about tomorrow). */
    reply_none: z.array(z.string()).optional(),
    /** True when the message is small talk that should save no memory. */
    no_memories: z.boolean().optional(),
    note: z.string().optional(),
  }),
});
export type EvalCase = z.infer<typeof EvalCase>;

// Lower-case and fold Arabic-Indic digits, so "١٦٣٢٨" matches "16328".
const lc = (s: string) => s.toLowerCase().replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
const anyIn = (hay: string, needles: string[]) => needles.some((n) => lc(hay).includes(lc(n)));

function matchItem(exp: z.infer<typeof ExpectedItem>, got: FriendResponse["create_items"][number]): boolean {
  if (exp.type && got.type !== exp.type) return false;
  if (exp.type_any && !exp.type_any.includes(got.type)) return false;
  if (exp.title_any && !anyIn(`${got.title} ${got.debt?.person ?? ""}`, exp.title_any)) return false;
  if (exp.due && got.due_at_local?.slice(0, 16) !== exp.due) return false;
  if (exp.due_date) {
    const allowed = Array.isArray(exp.due_date) ? exp.due_date : [exp.due_date];
    if (!got.due_at_local || !allowed.includes(got.due_at_local.slice(0, 10))) return false;
  }
  if (exp.important && !got.important) return false;
  if (exp.debt) {
    if (!got.debt) return false;
    if (!anyIn(`${got.debt.person} ${got.title}`, exp.debt.person_any)) return false;
    if (got.debt.amount !== exp.debt.amount || got.debt.direction !== exp.debt.direction) return false;
  }
  return true;
}

export interface CaseScore {
  id: string;
  extraction: boolean;
  style: boolean;
  problems: string[];
}

/** Score one model output against its case. Extraction = items/updates/memories/crisis; style = how it sounds. */
export function scoreCase(c: EvalCase, out: FriendResponse): CaseScore {
  const problems: string[] = [];

  // --- extraction ---
  const unmatched = [...out.create_items];
  for (const exp of c.expect.items) {
    const i = unmatched.findIndex((got) => matchItem(exp, got));
    if (i === -1) problems.push(`missing item ${JSON.stringify(exp)}`);
    else unmatched.splice(i, 1);
  }
  if (unmatched.length) problems.push(`extra items ${JSON.stringify(unmatched)}`);

  if (c.expect.updates) {
    for (const exp of c.expect.updates) {
      const got = out.update_items.find((u) => u.id === exp.id);
      if (!got) problems.push(`missing update ${exp.id}`);
      else {
        if (exp.status && got.status !== exp.status) problems.push(`update ${exp.id} status ${got.status} ≠ ${exp.status}`);
        if (exp.due && got.due_at_local?.slice(0, 16) !== exp.due) problems.push(`update ${exp.id} due ${got.due_at_local} ≠ ${exp.due}`);
      }
    }
    const expectedIds = new Set(c.expect.updates.map((u) => u.id));
    const extra = out.update_items.filter((u) => !expectedIds.has(u.id));
    if (extra.length) problems.push(`unexpected updates ${JSON.stringify(extra)}`);
  }

  if (c.expect.memories_any) {
    const text = out.save_memories.map((m) => `${m.subject} ${m.content}`).join(" ");
    if (!anyIn(text, c.expect.memories_any)) problems.push(`no memory about ${c.expect.memories_any.join("/")}`);
  }

  if (c.expect.no_memories && out.save_memories.length) problems.push(`saved a memory for small talk: ${JSON.stringify(out.save_memories)}`);

  const wantCrisis = c.expect.crisis ?? false;
  if (out.crisis !== wantCrisis) problems.push(`crisis ${out.crisis} ≠ ${wantCrisis}`);
  const extraction = problems.length === 0;

  // --- style (how natural it sounds; human review is still the real bar) ---
  const styleProblems: string[] = [];
  const reply = out.reply.join("\n");
  const hasArabic = /[؀-ۿ]/.test(reply);
  // The friend reads Franco but never writes it: every message of an Arabic/Franco reply needs Arabic letters.
  if (c.expect.script !== "english") {
    if (!out.reply.every((r) => /[؀-ۿ]/.test(r))) styleProblems.push("should reply in Arabic script");
    const franco = reply.match(/\b[a-z]*[a-z][2357][a-z]+\b|\b[2357][a-z]{2,}\b/gi);
    if (franco) styleProblems.push(`Franco in the reply: ${franco.slice(0, 3).join(", ")}`);
  }
  if (c.expect.script === "english" && hasArabic) styleProblems.push("should reply in English");
  if (c.expect.reply_none) {
    const hit = c.expect.reply_none.filter((w) => lc(reply).includes(lc(w)));
    if (hit.length) styleProblems.push(`reply should not mention ${hit.join("/")}`);
  }
  if (out.reply.some((r) => r.length > 300)) styleProblems.push("a message is over 300 chars");
  if (!c.expect.list_ok && /^\s*([-•*]|\d+[.)])\s+/m.test(reply)) styleProblems.push("checklist-style reply");
  if (c.expect.reply_any && !anyIn(reply, c.expect.reply_any)) styleProblems.push(`reply should mention ${c.expect.reply_any.join("/")}`);
  problems.push(...styleProblems);

  return { id: c.id, extraction, style: styleProblems.length === 0, problems };
}
