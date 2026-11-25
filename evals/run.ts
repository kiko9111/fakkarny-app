/**
 * npm run eval — score the friend on evals/cases/*.jsonl (PRD §8 M3).
 *
 *   npm run eval              validate cases; run the model if ANTHROPIC_API_KEY
 *                             (or FAKKARNI_ANTHROPIC_API_KEY) is set
 *   npm run eval -- --strict  exit 1 if extraction accuracy < 90%
 *   npm run eval -- --only ar-   run cases whose id starts with "ar-"
 *   npm run eval -- --brain phone --base-url http://127.0.0.1:8080 --label qwen3.5-2b
 *                             score an on-device model served by llama.cpp's llama-server
 *                             (OpenAI-compatible) with the phone persona, compact context and
 *                             the phone's JSON grammar: what the Android test mode runs
 *
 * Writes evals/out/latest.json and evals/out/review.csv (replies for blind native review).
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { anthropicApiKey, createAnthropicModel, costUsd, type Usage } from "../apps/api/src/ai/model";
import type { Item, Message, User } from "../apps/api/src/generated/prisma/client";
import { mustReplyInArabic, PHONE_RECENT_MESSAGES, renderContext, renderPhoneReplyContext, type ConversationContext } from "../apps/api/src/pipeline/context";
import { cleanPhoneReply, describeUnderstood, PHONE_REPLY_PROMPT, PHONE_REPLY_VERSION, templateReply } from "../apps/api/src/persona/phone-reply";
import { extractPhoneJson, phoneMessages, phoneReplySchema } from "@fakkarni/shared";
import { helplineMessage, looksDistressed, looksLikeCrisis, promisesReminder } from "../apps/api/src/pipeline/rules";
import { localToUtc } from "../apps/api/src/lib/time";
import { helplineFor, PERSONA_PROMPT, PERSONA_VERSION } from "../apps/api/src/persona/prompt";
import { EvalCase, scoreCase, type CaseScore } from "./score";
import { understand, type Understood } from "../packages/shared/src/understand";
import { CLARIFY_VERSION, clarifyMessages, cleanRewrite, pickUnderstood } from "../packages/shared/src/understand/clarify";
import type { AppData } from "../apps/api/src/chat/actions";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const strict = args.includes("--strict");
const arg = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const only = arg("--only");
const brain = (["phone", "rules", "clarify"].includes(arg("--brain") ?? "") ? arg("--brain") : "cloud") as "phone" | "rules" | "clarify" | "cloud";
const set = arg("--set") ?? "cases";
const baseUrl = arg("--base-url") ?? "http://127.0.0.1:8080";
const label = arg("--label") ?? "phone";

function loadCases(): EvalCase[] {
  const dir = join(here, /^(cases|holdout\d*)$/.test(set) ? set : "cases");
  const cases: EvalCase[] = [];
  const ids = new Set<string>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".jsonl"))) {
    readFileSync(join(dir, file), "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (!line.trim()) return;
        const parsed = EvalCase.safeParse(JSON.parse(line));
        if (!parsed.success) throw new Error(`${file}:${i + 1} invalid case: ${parsed.error.message}`);
        if (ids.has(parsed.data.id)) throw new Error(`${file}:${i + 1} duplicate id ${parsed.data.id}`);
        ids.add(parsed.data.id);
        cases.push(parsed.data);
      });
  }
  return cases;
}

/** The conversation as the pipeline sees it: the history, then the message being answered. */
function turnsOf(c: EvalCase): { role: "user" | "friend"; text: string }[] {
  return [...c.history.map((h) => ({ role: h.role === "user" ? ("user" as const) : ("friend" as const), text: h.text })), { role: "user" as const, text: c.message }];
}

/** Build the same context the API would, from the case (no database). */
function contextFor(c: EvalCase): string {
  return renderContext(contextObjectFor(c));
}

function contextObjectFor(c: EvalCase): ConversationContext {
  const now = localToUtc(c.now, c.tz);
  const user = {
    id: "eval-user", authId: "eval", name: null, language: c.expect.script === "english" ? "en" : "ar_EG", timezone: c.tz,
    wakeTime: "07:00", sleepTime: "23:00", tone: "balanced", checkinIntervalH: "h2", ignoredCheckins: 0, plan: "trial",
    planExpiresAt: null, createdAt: now, lastActiveAt: now,
  } as unknown as User;
  const openItems = c.open_items.map(
    (o) =>
      ({
        id: o.id, userId: user.id, type: o.type, title: o.title, dueAt: o.due_local ? localToUtc(o.due_local, c.tz) : null,
        remindAt: o.due_local ? localToUtc(o.due_local, c.tz) : null, repeatEveryMinutes: o.repeat ?? null, important: false, status: "open", debtPerson: o.debt_person ?? null,
        debtAmount: o.debt_amount ?? null, debtDirection: o.debt_direction ?? null, followUpAt: null,
        sourceMessageId: null, updatedAt: now, createdAt: now, doneAt: null,
      }) as unknown as Item,
  );
  const recent = turnsOf(c).map((t) => ({ ...t, createdAt: now, updatedAt: now })) as unknown as Message[];
  return { user, now, memories: [], openItems, summary: null, recent, app: appFor(c, now) };
}

/** The case's circles, sections and trackers in the shape the API loads them (names only matter). */
function appFor(c: EvalCase, now: Date): AppData | undefined {
  if (!c.app) return undefined;
  const circles = c.app.circles.map((x, n) => ({ id: `c${n}`, name: x.name, kind: x.kind, createdAt: now, members: [{ userId: "eval-user", name: null }, ...x.members.map((m, k) => ({ userId: `m${n}-${k}`, name: m }))] }));
  const sections = c.app.sections.map((x, n) => ({ id: `s${n}`, ownerId: "eval-user", circleId: x.circle ? "c" : null, name: x.name, kind: x.kind, budget: x.budget ?? null, createdAt: now, circle: x.circle ? { name: x.circle } : null }));
  const trackers = c.app.trackers.map((x, n) => ({ id: `t${n}`, userId: "eval-user", kind: x.kind, name: x.name ?? null, goal: x.goal ?? null, askTimes: [], unitLabel: null, circleId: null, pack: null, createdAt: now, circle: null }));
  return { circles, sections, trackers } as unknown as AppData;
}

async function mapLimit<T, R>(xs: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, xs.length) }, async () => {
      while (next < xs.length) {
        const i = next++;
        out[i] = await fn(xs[i]!);
      }
    }),
  );
  return out;
}

const csv = (s: string) => `"${s.replace(/"/g, '""').replace(/\n/g, " / ")}"`;

async function main() {
  let cases = loadCases();
  if (only) cases = cases.filter((c) => c.id.startsWith(only));
  console.log(`Loaded ${cases.length} valid eval cases (persona ${PERSONA_VERSION}).`);

  if (brain === "phone") return runPhone(cases);
  if (brain === "rules") return runRules(cases);
  if (brain === "clarify") return runClarify(cases);
  if (!anthropicApiKey()) {
    console.log("SKIPPED model run: neither FAKKARNI_ANTHROPIC_API_KEY nor ANTHROPIC_API_KEY is set. No accuracy measured.");
    return;
  }

  const model = createAnthropicModel();
  let totalCost = 0;
  const results = await mapLimit(cases, 5, async (c) => {
    const res = await model
      .respond({ system: PERSONA_PROMPT, context: contextFor(c), history: [...c.history, { role: "user", text: c.message }], requireArabic: mustReplyInArabic(turnsOf(c).filter((m) => m.role === "user").map((m) => m.text), c.expect.script === "english" ? "english" : "arabic"), todayLocal: c.now.slice(0, 10) })
      .catch((err: unknown) => ({ ok: false as const, reason: `error: ${(err as Error).message}`, usage: null as Usage | null }));
    if (res.usage) totalCost += costUsd(res.usage);
    if (!res.ok) {
      const score: CaseScore = { id: c.id, extraction: false, style: false, problems: [`no output (${res.reason})`] };
      return { c, score, reply: [] as string[], output: null };
    }
    return { c, score: scoreCase(c, res.output), reply: res.output.reply, output: res.output };
  });

  const n = results.length;
  const extractionOk = results.filter((r) => r.score.extraction).length;
  const styleOk = results.filter((r) => r.score.style).length;
  for (const r of results.filter((r) => !r.score.extraction || !r.score.style)) {
    console.log(`✗ ${r.c.id}: ${r.score.problems.join("; ")}`);
    console.log(`    user: ${r.c.message}`);
    console.log(`    friend: ${r.reply.join(" | ")}`);
  }
  const pct = (k: number) => `${((100 * k) / n).toFixed(1)}%`;
  console.log("");
  console.log(`Extraction accuracy: ${extractionOk}/${n} = ${pct(extractionOk)}  (target 90%)`);
  console.log(`Style checks passed: ${styleOk}/${n} = ${pct(styleOk)}  (automatic proxy; native review is the real bar)`);
  console.log(`Cost: $${totalCost.toFixed(4)}`);

  const outDir = join(here, "out");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "latest.json"), JSON.stringify({ persona: PERSONA_VERSION, extractionOk, styleOk, n, results }, null, 2));
  writeFileSync(
    join(outDir, "review.csv"),
    ["id,user_message,friend_reply,sounds_like_a_friend(1/0)", ...results.map((r) => [r.c.id, csv(r.c.message), csv(r.reply.join("\n")), ""].join(","))].join("\n"),
  );
  console.log(`Wrote evals/out/latest.json and evals/out/review.csv`);

  if (strict && extractionOk / n < 0.9) process.exit(1);
}

/**
 * The phone brain on llama-server, reply mode (as the app runs it since 2026-11-25): the rule
 * engine decides the actions, the model only writes the reply, told what was done. Extraction is
 * the engine's; style is the model's reply. One case at a time, timed.
 */
async function runPhone(cases: EvalCase[]) {
  console.log(`Phone brain "${label}" at ${baseUrl} (${PHONE_REPLY_VERSION}, reply only).`);
  const results = [];
  let ms = 0;
  let promptTokens = 0;
  let outTokens = 0;
  let fellBack = 0;
  for (const c of cases) {
    const ctx = contextObjectFor(c);
    const u = understand(inputOf(c));
    const titles = Object.fromEntries(c.open_items.map((o) => [o.id, o.title]));
    const history = [...c.history.map((h) => ({ role: h.role === "user" ? ("user" as const) : ("assistant" as const), text: h.text })), { role: "user" as const, text: c.message }].slice(-PHONE_RECENT_MESSAGES);
    const messages = phoneMessages({ system: PHONE_REPLY_PROMPT, context: `${renderPhoneReplyContext(ctx)}\n${describeUnderstood(u, c.now, titles)}`, history, persona: PHONE_REPLY_VERSION });
    const t0 = Date.now();
    let reply: string[] = [];
    let modelCrisis = false;
    const lang = c.expect.script === "english" ? "english" : "arabic";
    try {
      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages,
          temperature: 0.3,
          max_tokens: 260,
          response_format: { type: "json_schema", json_schema: { name: "zaki", schema: phoneReplySchema(lang) } },
          chat_template_kwargs: { enable_thinking: false },
        }),
      });
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      promptTokens += json.usage?.prompt_tokens ?? 0;
      outTokens += json.usage?.completion_tokens ?? 0;
      const raw = extractPhoneJson(json.choices?.[0]?.message?.content ?? "") as { reply?: unknown } | null;
      reply = Array.isArray(raw?.reply) ? cleanPhoneReply(raw!.reply.filter((r): r is string => typeof r === "string"), lang) : [];
      modelCrisis = (raw as { crisis?: unknown } | null)?.crisis === true;
    } catch {
      reply = [];
    }
    ms += Date.now() - t0;
    const usable = reply.length > 0 && !(promisesSomething(reply) && !didSomethingTimed(u));
    if (!usable) fellBack++;
    let finalReply = usable ? reply : templateReply(u, c.now, lang, titles);
    // The server's crisis safety net, as in pipeline/conversation.ts: the helpline is always added.
    const crisis = u.crisis || looksLikeCrisis(c.message) || (modelCrisis && looksDistressed(c.message));
    if (crisis) finalReply = [...finalReply, helplineMessage(lang, helplineFor(c.tz))];
    const output = { ...asOutput(c, u), reply: finalReply, crisis };
    results.push({ c, area: areaOf(c), score: scoreCase(c, output as never), reply: finalReply, modelReply: reply, output });
  }
  const n = results.length;
  const extractionOk = results.filter((r) => r.score.extraction).length;
  const styleOk = results.filter((r) => r.score.style).length;
  for (const r of results.filter((r) => !r.score.style)) {
    console.log(`✗ style ${r.c.id}: ${r.score.problems.filter((p) => /reply|Arabic|English|Franco|checklist|chars/.test(p)).join("; ")}`);
    console.log(`    user: ${r.c.message}`);
    console.log(`    zaki: ${r.reply.join(" | ")}`);
  }
  const pct = (k: number) => `${((100 * k) / n).toFixed(1)}%`;
  console.log("");
  console.log(`[${label}/${set}] Actions right (code): ${extractionOk}/${n} = ${pct(extractionOk)}`);
  console.log(`[${label}/${set}] Style checks passed: ${styleOk}/${n} = ${pct(styleOk)}`);
  console.log(`[${label}/${set}] Code wrote the reply instead (model failed or over-promised): ${fellBack}/${n}`);
  console.log(`[${label}/${set}] Avg ${Math.round(ms / n)} ms/case, ${Math.round(promptTokens / n)} prompt + ${Math.round(outTokens / n)} output tokens per case (runner CPU, not a phone)`);
  const outDir = join(here, "out");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `phone-${label}-${set}.json`), JSON.stringify({ label, set, persona: PHONE_REPLY_VERSION, extractionOk, styleOk, fellBack, n, avgMs: ms / n, results }, null, 2));
}

/** A reply that says something was set or saved. */
const promisesSomething = (reply: string[]) => promisesReminder(reply);
const didSomethingTimed = (u: Understood) => u.create_items.some((i) => i.due_at_local) || u.update_items.some((x) => x.due_at_local) || u.app_actions.some((a) => a.ask_times?.length);

/** The part of the app a case tests: its `area`, else read from what it expects. */
function areaOf(c: EvalCase): string {
  if (c.area) return c.area;
  const e = c.expect;
  if (e.crisis) return "crisis";
  const kinds = (e.actions ?? []).map((a) => a.kind);
  const pick = (re: RegExp) => kinds.some((k) => re.test(k));
  if (pick(/^split/)) return "split";
  if (pick(/homework/) ) return "homework";
  if (pick(/^task|assign_task/)) return "task";
  if (pick(/tracker/)) return "tracker";
  if (pick(/money|section|budget/)) return "money";
  if (pick(/daftar/)) return "daftar";
  if (pick(/circle|invite|checkin/)) return "circle";
  if (kinds.length) return "app";
  if (e.ask) return "ask";
  if (e.updates?.length) return "reminder-edit";
  if (e.items.some((i) => i.type === "debt" || i.debt)) return "daftar";
  if (e.items.length) return e.items.some((i) => i.due || i.due_date || i.repeat) ? "reminder" : "task";
  if (e.memories_any) return "memory";
  return "chat";
}

function inputOf(c: EvalCase, text = c.message) {
  return { text, nowLocal: c.now, history: c.history, openItems: c.open_items, app: c.app };
}
function asOutput(c: EvalCase, u: Understood) {
  return { reply: [c.expect.script === "english" ? "Done." : "تمام."], create_items: u.create_items, update_items: u.update_items, save_memories: u.save_memories, app_actions: u.app_actions, crisis: u.crisis, ask: u.ask };
}
function areaTable(name: string, rows: { area: string; ok: boolean }[]) {
  const by = new Map<string, { n: number; ok: number }>();
  for (const r of rows) {
    const a = by.get(r.area) ?? { n: 0, ok: 0 };
    a.n++;
    if (r.ok) a.ok++;
    by.set(r.area, a);
  }
  const ok = rows.filter((r) => r.ok).length;
  console.log(`\n${name}: ${ok}/${rows.length} = ${((100 * ok) / rows.length).toFixed(1)}%`);
  for (const [a, v] of [...by.entries()].sort()) console.log(`  ${a.padEnd(16)}${String(v.ok).padStart(4)} / ${v.n}`);
  return { ok, n: rows.length, byArea: Object.fromEntries(by) };
}

/**
 * The hidden clear-form step: a small model on llama-server rewrites each message, the rule engine
 * reads the rewrite. Scores code alone, rewrite alone, and both (rewrite used only when the code
 * found nothing on the original), per area.
 */
async function runClarify(cases: EvalCase[]) {
  console.log(`Clear-form rewrite "${label}" at ${baseUrl} (${CLARIFY_VERSION}) on ${cases.length} cases from evals/${set}/.`);
  const rows = [];
  let ms = 0;
  for (const c of cases) {
    const t0 = Date.now();
    let rewrite: string | null = null;
    try {
      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: clarifyMessages(c.message, c.history), temperature: 0, max_tokens: 120, chat_template_kwargs: { enable_thinking: false } }),
      });
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      rewrite = cleanRewrite((json.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, ""));
    } catch {
      rewrite = null;
    }
    ms += Date.now() - t0;
    const u1 = understand(inputOf(c));
    const u2 = rewrite ? understand(inputOf(c, rewrite)) : null;
    const both = pickUnderstood(u1, u2);
    const s1 = scoreCase(c, asOutput(c, u1) as never);
    const s2 = u2 ? scoreCase(c, asOutput(c, u2) as never) : { extraction: false, problems: ["no rewrite"] };
    const s3 = scoreCase(c, asOutput(c, both) as never);
    rows.push({ id: c.id, area: areaOf(c), message: c.message, rewrite, code: s1.extraction, rewriteOnly: s2.extraction, both: s3.extraction, problems: s3.problems });
  }
  for (const r of rows.filter((r) => !r.both)) console.log(`✗ [${r.area}] ${r.id}\n    user:    ${r.message}\n    rewrite: ${r.rewrite}\n    ${r.problems.filter((p) => !/reply|Arabic|English|Franco/.test(p)).join("; ")}`);
  const a = areaTable(`[${label}/${set}] Code alone`, rows.map((r) => ({ area: r.area, ok: r.code })));
  const b = areaTable(`[${label}/${set}] Rewrite, then code`, rows.map((r) => ({ area: r.area, ok: r.rewriteOnly })));
  const d = areaTable(`[${label}/${set}] Code, rewrite only when code found nothing`, rows.map((r) => ({ area: r.area, ok: r.both })));
  console.log(`[${label}/${set}] Avg ${Math.round(ms / rows.length)} ms per rewrite (runner CPU, not a phone)`);
  const outDir = join(here, "out");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `clarify-${label}-${set}.json`), JSON.stringify({ label, set, version: CLARIFY_VERSION, code: a, rewrite: b, both: d, avgMs: ms / rows.length, rows }, null, 2));
}

/**
 * The rule engine alone (no model): code decides every action, the reply is a placeholder.
 * Scores extraction only, per area, so misses show where they are.
 */
function runRules(cases: EvalCase[]) {
  console.log(`Rule engine (no model) on ${cases.length} cases from evals/${set}/.`);
  const results = cases.map((c) => {
    const u = understand({
      text: c.message,
      nowLocal: c.now,
      history: c.history,
      openItems: c.open_items,
      app: c.app,
    });
    const output = { reply: [c.expect.script === "english" ? "Done." : "تمام."], create_items: u.create_items, update_items: u.update_items, save_memories: u.save_memories, app_actions: u.app_actions, crisis: u.crisis, ask: u.ask };
    return { c, area: areaOf(c), score: scoreCase(c, output as never), output };
  });
  const byArea = new Map<string, { n: number; ok: number }>();
  for (const r of results) {
    const a = byArea.get(r.area) ?? { n: 0, ok: 0 };
    a.n++;
    if (r.score.extraction) a.ok++;
    byArea.set(r.area, a);
  }
  for (const r of results.filter((r) => !r.score.extraction)) {
    console.log(`✗ [${r.area}] ${r.c.id}: ${r.score.problems.filter((p) => !/reply|Arabic|English|Franco/.test(p)).join("; ")}`);
    console.log(`    user: ${r.c.message}`);
  }
  console.log("");
  console.log("Area            right / cases   missed");
  for (const [a, v] of [...byArea.entries()].sort()) console.log(`${a.padEnd(16)}${String(v.ok).padStart(5)} / ${String(v.n).padEnd(6)}  ${(100 * (1 - v.ok / v.n)).toFixed(0)}%`);
  const ok = results.filter((r) => r.score.extraction).length;
  console.log(`\n[rules/${set}] Right: ${ok}/${results.length} = ${((100 * ok) / results.length).toFixed(1)}%`);
  const outDir = join(here, "out");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `rules-${set}.json`), JSON.stringify({ ok, n: results.length, byArea: Object.fromEntries(byArea), results }, null, 2));
}

await main();
