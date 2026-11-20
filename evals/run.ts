/**
 * npm run eval — score the friend on evals/cases/*.jsonl (PRD §8 M3).
 *
 *   npm run eval              validate cases; run the model if ANTHROPIC_API_KEY
 *                             (or FAKKARNI_ANTHROPIC_API_KEY) is set
 *   npm run eval -- --strict  exit 1 if extraction accuracy < 90%
 *   npm run eval -- --only ar-   run cases whose id starts with "ar-"
 *
 * Writes evals/out/latest.json and evals/out/review.csv (replies for blind native review).
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { anthropicApiKey, createAnthropicModel, costUsd, type Usage } from "../apps/api/src/ai/model";
import type { Item, Message, User } from "../apps/api/src/generated/prisma/client";
import { renderContext } from "../apps/api/src/pipeline/context";
import { localToUtc } from "../apps/api/src/lib/time";
import { PERSONA_PROMPT, PERSONA_VERSION } from "../apps/api/src/persona/prompt";
import { EvalCase, scoreCase, type CaseScore } from "./score";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const strict = args.includes("--strict");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined;

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

/** Build the same context the API would, from the case (no database). */
function contextFor(c: EvalCase): string {
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
        remindAt: null, important: false, status: "open", debtPerson: o.debt_person ?? null,
        debtAmount: o.debt_amount ?? null, debtDirection: o.debt_direction ?? null, followUpAt: null,
        sourceMessageId: null, updatedAt: now, createdAt: now, doneAt: null,
      }) as unknown as Item,
  );
  return renderContext({ user, now, memories: [], openItems, summary: null, recent: [] as Message[] });
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

  if (!anthropicApiKey()) {
    console.log("SKIPPED model run: neither FAKKARNI_ANTHROPIC_API_KEY nor ANTHROPIC_API_KEY is set. No accuracy measured.");
    return;
  }

  const model = createAnthropicModel();
  let totalCost = 0;
  const results = await mapLimit(cases, 5, async (c) => {
    const res = await model
      .respond({ system: PERSONA_PROMPT, context: contextFor(c), history: [...c.history, { role: "user", text: c.message }] })
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

await main();
