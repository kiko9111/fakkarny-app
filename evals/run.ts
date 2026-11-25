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
import { mustReplyInArabic, PHONE_RECENT_MESSAGES, renderContext, renderPhoneContext, type ConversationContext } from "../apps/api/src/pipeline/context";
import { phoneToFriendResponse } from "../apps/api/src/ai/phone";
import { PHONE_PERSONA_VERSION, PHONE_PROMPT } from "../apps/api/src/persona/phone";
import { extractPhoneJson, PHONE_OUTPUT_JSON_SCHEMA, phoneMessages } from "@fakkarni/shared";
import { localToUtc } from "../apps/api/src/lib/time";
import { PERSONA_PROMPT, PERSONA_VERSION } from "../apps/api/src/persona/prompt";
import { EvalCase, scoreCase, type CaseScore } from "./score";
import type { AppData } from "../apps/api/src/chat/actions";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const strict = args.includes("--strict");
const arg = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const only = arg("--only");
const brain = arg("--brain") === "phone" ? "phone" : "cloud";
const baseUrl = arg("--base-url") ?? "http://127.0.0.1:8080";
const label = arg("--label") ?? "phone";

function loadCases(): EvalCase[] {
  const dir = join(here, "cases");
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
 * The phone brain on llama-server: same prompt, context, grammar and conversion as the app.
 * One case at a time (a phone answers one message at a time too), timing each.
 */
async function runPhone(cases: EvalCase[]) {
  console.log(`Phone brain "${label}" at ${baseUrl} (persona ${PHONE_PERSONA_VERSION}).`);
  const results = [];
  let ms = 0;
  let promptTokens = 0;
  let outTokens = 0;
  for (const c of cases) {
    const ctx = contextObjectFor(c);
    const history = [...c.history.map((h) => ({ role: h.role === "user" ? ("user" as const) : ("assistant" as const), text: h.text })), { role: "user" as const, text: c.message }].slice(-PHONE_RECENT_MESSAGES);
    const messages = phoneMessages({ system: PHONE_PROMPT, context: renderPhoneContext(ctx), history, persona: PHONE_PERSONA_VERSION });
    const t0 = Date.now();
    let reply: string[] = [];
    let score: CaseScore;
    let output: unknown = null;
    try {
      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages,
          temperature: 0.3,
          max_tokens: 700,
          response_format: { type: "json_schema", json_schema: { name: "zaki", schema: PHONE_OUTPUT_JSON_SCHEMA } },
          chat_template_kwargs: { enable_thinking: false },
        }),
      });
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      promptTokens += json.usage?.prompt_tokens ?? 0;
      outTokens += json.usage?.completion_tokens ?? 0;
      const raw = extractPhoneJson(json.choices?.[0]?.message?.content ?? "");
      const parsed = phoneToFriendResponse(raw, c.now);
      output = parsed;
      reply = parsed.reply;
      score = scoreCase(c, parsed);
    } catch (err) {
      score = { id: c.id, extraction: false, style: false, problems: [`no usable output (${(err as Error).message.slice(0, 120)})`] };
    }
    ms += Date.now() - t0;
    results.push({ c, score, reply, output });
  }
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
  console.log(`[${label}] Extraction accuracy: ${extractionOk}/${n} = ${pct(extractionOk)}`);
  console.log(`[${label}] Style checks passed: ${styleOk}/${n} = ${pct(styleOk)}`);
  console.log(`[${label}] Avg ${Math.round(ms / n)} ms/case, ${Math.round(promptTokens / n)} prompt + ${Math.round(outTokens / n)} output tokens per case (server CPU, not a phone)`);
  const outDir = join(here, "out");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `phone-${label}.json`), JSON.stringify({ label, persona: PHONE_PERSONA_VERSION, extractionOk, styleOk, n, avgMs: ms / n, results }, null, 2));
  writeFileSync(join(outDir, `phone-${label}-summary.json`), JSON.stringify({ label, extraction: extractionOk / n, style: styleOk / n, n, avgMs: Math.round(ms / n), promptTokens: Math.round(promptTokens / n), outTokens: Math.round(outTokens / n) }));
}

await main();
