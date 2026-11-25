import { z } from "zod";
import type { FriendResponse as FullResponse } from "@fakkarni/shared";
/** What the model returns; app_actions may be missing (older fakes, tests). */
type FriendResponse = Omit<FullResponse, "app_actions"> & { app_actions?: FullResponse["app_actions"]; ask?: string | null };

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
  /** true = must ring as an alarm; false = must not (alarms only when asked). */
  alarm: z.boolean().optional(),
  /** Minutes between occurrences of a repeating reminder. */
  repeat: z.number().optional(),
  /** True when the item must carry a follow-up time ("how did it go?"). */
  follow_up: z.boolean().optional(),
  debt: z
    .object({ person_any: z.array(z.string()), amount: z.number(), direction: z.enum(["owed_to_me", "i_owe"]) })
    .optional(),
});

/** What a case expects in app_actions; every given field must match. */
export const ExpectedAction = z.object({
  kind: z.string(),
  amount: z.number().optional(),
  money_kind: z.enum(["expense", "income"]).optional(),
  tracker_kind: z.string().optional(),
  /** Any of these substrings in the section / tracker / circle / person / name / title / text. */
  name_any: z.array(z.string()).optional(),
  section_any: z.array(z.string()).optional(),
  person_any: z.array(z.string()).optional(),
  circle_any: z.array(z.string()).optional(),
  ask_times: z.array(z.string()).optional(),
  /** True when the action must leave the section empty (catch-all). */
  no_section: z.boolean().optional(),
  answer: z.enum(["yes", "no"]).optional(),
  setting: z.string().optional(),
  screen: z.string().optional(),
  checkin_kind: z.string().optional(),
  direction: z.enum(["owed_to_me", "i_owe"]).optional(),
  /** Each of these names must be among people (split_bill). */
  people_all: z.array(z.string()).optional(),
  /** Any of these substrings in text (settings value, post text, forget). */
  text_any: z.array(z.string()).optional(),
});

/** What the user has in the app for this case (IN THE APP in the context). */
export const CaseApp = z.object({
  circles: z.array(z.object({ name: z.string(), kind: z.enum(["friends", "family"]).default("family"), members: z.array(z.string()) })).default([]),
  sections: z.array(z.object({ name: z.string(), kind: z.enum(["expense", "income"]).default("expense"), budget: z.number().optional(), circle: z.string().optional() })).default([]),
  trackers: z.array(z.object({ kind: z.string(), name: z.string().optional(), goal: z.number().optional() })).default([]),
});

/** A question Zaki must ask instead of acting, because something is missing (or it must confirm a delete). */
export const AskSlot = z.enum(["time", "amount", "person", "confirm", "what"]);

export const EvalCase = z.object({
  id: z.string(),
  /** The part of the app this case tests (per-area miss rates). Derived from the id when absent. */
  area: z.string().optional(),
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
        repeat: z.number().optional(),
        debt_person: z.string().optional(),
        debt_amount: z.number().optional(),
        debt_direction: z.enum(["owed_to_me", "i_owe"]).optional(),
      }),
    )
    .default([]),
  app: CaseApp.optional(),
  message: z.string(),
  expect: z.object({
    /** Zaki must ask this (and not act yet). Absent = it must not ask a follow-up question. */
    ask: AskSlot.optional(),
    /** Expected app_actions. Absent = the model must not act in the app for this message. */
    actions: z.array(ExpectedAction).optional(),
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
  if (exp.alarm !== undefined && Boolean(got.alarm) !== exp.alarm) return false;
  if (exp.repeat !== undefined && got.repeat_every_minutes !== exp.repeat) return false;
  if (exp.follow_up && !got.follow_up_at_local) return false;
  if (exp.debt) {
    if (!got.debt) return false;
    if (!anyIn(`${got.debt.person} ${got.title}`, exp.debt.person_any)) return false;
    if (got.debt.amount !== exp.debt.amount || got.debt.direction !== exp.debt.direction) return false;
  }
  return true;
}

function matchAction(exp: z.infer<typeof ExpectedAction>, got: NonNullable<FriendResponse["app_actions"]>[number]): boolean {
  if (got.kind !== exp.kind) return false;
  if (exp.amount !== undefined && got.amount !== exp.amount) return false;
  if (exp.money_kind && (got.money_kind ?? "expense") !== exp.money_kind) return false;
  if (exp.tracker_kind && (got.tracker_kind ?? "custom") !== exp.tracker_kind) return false;
  if (exp.name_any && !anyIn(`${got.name ?? ""} ${got.title ?? ""} ${got.text ?? ""} ${got.tracker ?? ""} ${got.section ?? ""}`, exp.name_any)) return false;
  if (exp.section_any && !anyIn(got.section ?? "", exp.section_any)) return false;
  if (exp.no_section && got.section) return false;
  if (exp.person_any && !anyIn(got.person ?? "", exp.person_any)) return false;
  if (exp.circle_any && !anyIn(got.circle ?? "", exp.circle_any)) return false;
  if (exp.answer && got.answer !== exp.answer) return false;
  if (exp.setting && got.setting !== exp.setting) return false;
  if (exp.screen && got.screen !== exp.screen) return false;
  if (exp.checkin_kind && (got.checkin_kind ?? "ok") !== exp.checkin_kind) return false;
  if (exp.direction && (got.direction ?? "owed_to_me") !== exp.direction) return false;
  if (exp.people_all && !exp.people_all.every((n) => (got.people ?? []).some((p) => anyIn(p, [n])))) return false;
  if (exp.text_any && !anyIn(got.text ?? "", exp.text_any)) return false;
  if (exp.ask_times && JSON.stringify([...(got.ask_times ?? [])].sort()) !== JSON.stringify([...exp.ask_times].sort())) return false;
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

  const gotActions = [...(out.app_actions ?? [])];
  for (const exp of c.expect.actions ?? []) {
    const i = gotActions.findIndex((got) => matchAction(exp, got));
    if (i === -1) problems.push(`missing app action ${JSON.stringify(exp)}`);
    else gotActions.splice(i, 1);
  }
  if (gotActions.length) problems.push(`extra app actions ${JSON.stringify(gotActions)}`);

  if (c.expect.ask && out.ask !== c.expect.ask) problems.push(`should ask for ${c.expect.ask}${out.ask ? `, asked for ${out.ask}` : ""}`);
  if (!c.expect.ask && out.ask) problems.push(`asked for ${out.ask} instead of acting`);

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
