import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { AppAction, CHAT_SCREENS, CHAT_SETTINGS, MAX_APP_ACTIONS, MoneyKind, TrackerKind, type AppActionKind } from "@fakkarni/shared";

/**
 * The friend's turn as tool calls (2026-11-23, "Zaki runs the whole app from chat"): one tool
 * for the reply and what to remember (`respond`, strict, the same fields the old structured
 * output had), plus one small tool per area of the app. The model calls `respond` and any app
 * tools in the SAME message; the server never sends tool results back, so a turn stays one
 * model call. App tools are not strict (no grammar, so the structured-output size limits don't
 * apply to them): every call is validated with zod here and a call that doesn't fit is dropped
 * on its own.
 */

const Str = z.string();
const Local = z.string().describe('Local wall-clock time "YYYY-MM-DDTHH:MM"');

/** The reply and what to remember: exactly the old structured output without app actions. */
export const RespondInput = z.object({
  reply: z.array(z.string()),
  create_items: z.array(
    z.object({
      type: z.enum(["task", "reminder", "note", "list_item", "debt"]),
      title: z.string(),
      due_at_local: z.string().nullable(),
      remind_at_local: z.string().nullable(),
      follow_up_at_local: z.string().nullable(),
      important: z.boolean(),
      alarm: z.boolean(),
      nudge: z.string().nullable(),
      repeat_every_minutes: z.number().nullable(),
      debt: z.object({ person: z.string(), amount: z.number(), direction: z.enum(["owed_to_me", "i_owe"]) }).nullable(),
    }),
  ),
  update_items: z.array(
    z.object({
      id: z.string(),
      title: z.string().nullable(),
      status: z.enum(["open", "done", "cancelled"]).nullable(),
      due_at_local: z.string().nullable(),
      remind_at_local: z.string().nullable(),
      follow_up_at_local: z.string().nullable(),
      repeat_every_minutes: z.number().nullable(),
      alarm: z.boolean().nullable(),
    }),
  ),
  save_memories: z.array(z.object({ kind: z.enum(["person", "place", "preference", "fact"]), subject: z.string(), content: z.string() })),
  crisis: z.boolean(),
});
export type RespondInput = z.infer<typeof RespondInput>;

interface AreaTool<A extends string> {
  name: string;
  description: string;
  actions: Record<A, AppActionKind>;
  input: z.ZodObject;
}

const area = <A extends string>(t: AreaTool<A>) => t;

/** One tool per area. `actions` maps the tool's `action` value to the AppAction kind. */
export const AREA_TOOLS = [
  area({
    name: "money",
    description:
      "The user's own money: log what they spent or received (log), make a section or a shared expense book with a circle (create_section), set or remove a monthly budget (set_budget; amount 0 removes it), delete one of their entries (delete_entry: the latest one matching section/amount/note), delete a section (delete_section). Money between the user and a person is NOT this tool: that is a debt item, and the daftar tool when they want it in the Daftar.",
    actions: { log: "log_money", create_section: "create_section", set_budget: "set_budget", delete_entry: "delete_money_entry", delete_section: "delete_section" },
    input: z.object({
      action: z.enum(["log", "create_section", "set_budget", "delete_entry", "delete_section"]),
      amount: z.number().optional().describe("EGP; for create_section/set_budget the monthly budget"),
      money_kind: MoneyKind.optional(),
      section: Str.optional().describe("A section name from IN THE APP, or a new one they named"),
      name: Str.optional().describe("create_section: the new section's name"),
      note: Str.optional(),
      circle: Str.optional().describe("create_section: makes it a shared book with this circle"),
    }),
  }),
  area({
    name: "daftar",
    description:
      "The Daftar: debts between the user and one person that both of them see and confirm. add records one (it waits for their OK when the person is in their circles; otherwise they send the link from their own WhatsApp). settle = it was paid back, cancel = the user's own entry was a mistake, answer = the user answers an entry someone recorded with them (answer yes = it's right, no = not right), remind = get the gentle reminder link to send. Use ref (a Daftar id from the context) or person.",
    actions: { add: "daftar_add", settle: "daftar_settle", cancel: "daftar_cancel", answer: "daftar_answer", remind: "daftar_remind" },
    input: z.object({
      action: z.enum(["add", "settle", "cancel", "answer", "remind"]),
      person: Str.optional(),
      amount: z.number().optional(),
      direction: z.enum(["owed_to_me", "i_owe"]).optional().describe("owed_to_me: the person owes the user"),
      note: Str.optional(),
      ref: Str.optional().describe("A Daftar id from DAFTAR in the context"),
      answer: z.enum(["yes", "no"]).optional(),
    }),
  }),
  area({
    name: "tracker",
    description:
      "Habits and things the user follows day by day: create one, log progress, update its goal or ask times, undo the last log of today (undo), delete it (delete), or add the Ramadan pack (ramadan_pack: fasting, prayers, Quran, charity; only in Ramadan).",
    actions: { create: "create_tracker", log: "log_tracker", update: "update_tracker", undo: "undo_tracker", delete: "delete_tracker", ramadan_pack: "ramadan_pack" },
    input: z.object({
      action: z.enum(["create", "log", "update", "undo", "delete", "ramadan_pack"]),
      tracker: Str.optional().describe("The tracker's name (from IN THE APP), or the new name for create"),
      tracker_kind: TrackerKind.optional(),
      amount: z.number().optional().describe("log: how much; create/update: the daily goal"),
      unit: Str.optional().describe('custom trackers: "صفحة", "دقيقة", "خطوة"'),
      ask_times: z.array(Str).optional().describe('"HH:MM" times Zaki asks, at most 3'),
      circle: Str.optional().describe("create: share it with this circle"),
    }),
  }),
  area({
    name: "circle",
    description:
      "The user's circles (family, friends, any group): create one, get its invite link to send from their WhatsApp (invite), join one with a code they were given (join), rename one they own (rename), leave one (leave), tell a circle how they are (checkin: arrived, home, on_way, medicine, ok; never a location), ask one person to check in (ask_checkin), post something from Zaki in a circle (post: \"remind everyone about Friday lunch\"), invite a circle to iftar (iftar).",
    actions: { create: "create_circle", invite: "invite", join: "join_circle", rename: "rename_circle", leave: "leave_circle", checkin: "checkin", ask_checkin: "ask_checkin", post: "ask_circle", iftar: "iftar" },
    input: z.object({
      action: z.enum(["create", "invite", "join", "rename", "leave", "checkin", "ask_checkin", "post", "iftar"]),
      circle: Str.optional().describe("A circle name from IN THE APP"),
      name: Str.optional().describe("create: the new circle's name; rename: the new name"),
      family: z.boolean().optional(),
      person: Str.optional(),
      text: Str.optional().describe("post: what to say; join: the invite code"),
      checkin_kind: z.enum(["arrived", "home", "on_way", "medicine", "ok"]).optional(),
      note: Str.optional(),
      day_local: Local.optional().describe("iftar: the day (time 19:00 if none)"),
    }),
  }),
  area({
    name: "task",
    description:
      "Tasks between people in a circle: ask someone to do something (assign; homework true for a child's school work, the link or pages in note), answer a request someone sent the user (answer yes/no), remind the person again (nudge), cancel a task the user asked for (cancel), change when Zaki reminds about it (remind), hand in homework as text or a link (homework_submit), or answer homework that was handed in (homework_review: yes = well done, no = redo, with a note). ref is a task id from TASKS in the context.",
    actions: { assign: "assign_task", answer: "task_answer", nudge: "task_nudge", cancel: "task_cancel", remind: "task_remind", homework_submit: "homework_submit", homework_review: "homework_review" },
    input: z.object({
      action: z.enum(["assign", "answer", "nudge", "cancel", "remind", "homework_submit", "homework_review"]),
      person: Str.optional(),
      title: Str.optional(),
      circle: Str.optional(),
      due_at_local: Local.optional(),
      remind_at_local: Local.optional(),
      homework: z.boolean().optional(),
      note: Str.optional(),
      ref: Str.optional().describe("A task id from TASKS in the context"),
      answer: z.enum(["yes", "no"]).optional(),
      text: Str.optional().describe("homework_submit: the answer or link"),
    }),
  }),
  area({
    name: "split",
    description:
      "Split a bill with friends: create one with the total and the other people's names (equal shares to start; each friend can add their own items on the page the user sends), or mark that a person paid their share (paid).",
    actions: { create: "split_bill", paid: "split_paid" },
    input: z.object({
      action: z.enum(["create", "paid"]),
      amount: z.number().optional().describe("create: the whole bill as paid"),
      people: z.array(Str).optional().describe("create: the others at the table, without the user"),
      title: Str.optional(),
      ref: Str.optional().describe("paid: a split id from SPLITS"),
      person: Str.optional().describe("paid: who paid"),
    }),
  }),
  area({
    name: "app",
    description:
      "Everything else: forget something you remembered about them (forget, with what to forget), change a setting (settings: name, wake_time / sleep_time \"HH:MM\", instapay (their https://ipn.eg link), address (\"female\" or \"male\"), tone (playful, balanced, calm), checkins (2, 4 = every 2 or 4 hours, off)), or open a place in the app (open: memories, settings, money, daftar, trackers, circles, today, receipt (read a receipt photo), invite_friend, paywall, split, session).",
    actions: { forget: "forget", settings: "settings", open: "open_screen" },
    input: z.object({
      action: z.enum(["forget", "settings", "open"]),
      text: Str.optional().describe("forget: what to forget; settings: the new value"),
      setting: z.enum(CHAT_SETTINGS).optional(),
      screen: z.enum(CHAT_SCREENS).optional(),
    }),
  }),
] as const;

const RESPOND_DESCRIPTION =
  "Your answer to the user: 1-3 short reply messages, items to create or update, lasting memories, and the crisis flag. Call it exactly once in every turn.";

function jsonSchema(schema: z.ZodType): Anthropic.Tool.InputSchema {
  const { $schema: _drop, ...rest } = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  return rest as Anthropic.Tool.InputSchema;
}

/**
 * The tools sent with every chat turn (deterministic, so they cache with the persona).
 * `eager`: only on a request asked for as a stream (ai/respond-stream.ts), so the words of the
 * reply arrive as they are written instead of in one piece. A request that is not a stream is
 * sent exactly as before.
 */
export function friendTools(opts: { eager?: boolean } = {}): Anthropic.ToolUnion[] {
  return [
    // Strict: the same grammar-checked schema the structured output used (12 nullable fields,
    // under the API's 16; src/ai/model.test.ts guards it).
    {
      name: "respond",
      description: RESPOND_DESCRIPTION,
      input_schema: zodOutputFormat(RespondInput).schema as Anthropic.Tool.InputSchema,
      strict: true,
      ...(opts.eager ? { eager_input_streaming: true } : {}),
    },
    ...AREA_TOOLS.map((t): Anthropic.Tool => ({ name: t.name, description: t.description, input_schema: jsonSchema(t.input) })),
  ];
}

/** Drop "", null, [] and false so optional fields are simply absent. */
function clean(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== false && !(typeof v === "string" && !v.trim()) && !(Array.isArray(v) && !v.length)),
  );
}

/**
 * One app tool call → an AppAction, or null when it doesn't fit (unknown tool or action, wrong
 * types). Never throws: one odd call never costs the user their reply.
 */
export function toolCallToAction(name: string, input: unknown): AppAction | null {
  const tool = AREA_TOOLS.find((t) => t.name === name);
  if (!tool || !input || typeof input !== "object") return null;
  const raw = clean(input as Record<string, unknown>);
  const kind = (tool.actions as Record<string, AppActionKind>)[String(raw["action"])];
  if (!kind) return null;
  const { action: _a, day_local, ...rest } = raw;
  const o: Record<string, unknown> = { ...rest, kind };
  if (typeof day_local === "string") o["due_at_local"] = day_local.length === 10 ? `${day_local}T19:00` : day_local;
  // set_budget with amount 0 means "remove the budget"; elsewhere 0 means "not given".
  if (typeof o["amount"] === "number" && !(o["amount"] > 0)) {
    if (kind === "set_budget") o["amount"] = null;
    else delete o["amount"];
  } else if (kind === "set_budget" && o["amount"] === undefined) o["amount"] = null;
  if (kind === "split_bill" && typeof o["title"] === "string") {
    o["name"] = o["title"];
    delete o["title"];
  }
  if (kind === "settings" && typeof o["text"] === "string") o["text"] = o["text"].slice(0, 200);
  // Names and texts the model makes too long are cut rather than dropped.
  for (const k of ["name", "title", "section", "tracker", "circle", "person"] as const) if (typeof o[k] === "string") o[k] = o[k].slice(0, 60);
  for (const k of ["note", "text"] as const) if (typeof o[k] === "string") o[k] = o[k].slice(0, 200);
  const parsed = AppAction.safeParse(o);
  return parsed.success ? parsed.data : null;
}

/** The model's message → the respond input (unparsed) and the app actions it asked for. */
export function readToolCalls(content: Anthropic.ContentBlock[]): { respond: unknown | null; actions: AppAction[]; dropped: number } {
  let respond: unknown | null = null;
  const actions: AppAction[] = [];
  let dropped = 0;
  for (const block of content) {
    if (block.type !== "tool_use") continue;
    if (block.name === "respond") {
      respond ??= block.input;
      continue;
    }
    const a = toolCallToAction(block.name, block.input);
    if (a && actions.length < MAX_APP_ACTIONS) actions.push(a);
    else dropped++;
  }
  return { respond, actions, dropped };
}
