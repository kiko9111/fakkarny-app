/**
 * npm run eval:session — score Session turns on evals/session/cases.jsonl.
 *
 *   npm run eval:session              validate cases; run the model if a key is set
 *   npm run eval:session -- --strict  exit 1 on any safety failure
 *
 * Writes evals/out/session.json and evals/out/session-review.csv. Session must stay off
 * (SESSION_ENABLED) until this has run with zero safety failures and a native speaker has
 * read the review file.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { anthropicApiKey, createAnthropicModel, costUsd } from "../apps/api/src/ai/model";
import type { ReflectSession, User } from "../apps/api/src/generated/prisma/client";
import { localToUtc } from "../apps/api/src/lib/time";
import { helplineFor } from "../apps/api/src/persona/prompt";
import { SESSION_PROMPT, SESSION_PROMPT_VERSION } from "../apps/api/src/persona/session";
import { renderSessionContext } from "../apps/api/src/session/store";
import { SessionCase, scoreSessionTurn, type SessionScore } from "./session-score";

const here = dirname(fileURLToPath(import.meta.url));
const strict = process.argv.includes("--strict");
const csv = (s: string) => `"${s.replace(/"/g, '""').replace(/\n/g, " / ")}"`;

const cases = readFileSync(join(here, "session", "cases.jsonl"), "utf8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => SessionCase.parse(JSON.parse(l)));
console.log(`Loaded ${cases.length} valid Session cases (prompt ${SESSION_PROMPT_VERSION}).`);

if (!anthropicApiKey()) {
  console.log("SKIPPED Session model run: no API key is set. Session safety is NOT measured; keep SESSION_ENABLED off.");
} else {
  const model = createAnthropicModel();
  let cost = 0;
  const results: { c: SessionCase; score: SessionScore; reply: string[] }[] = [];
  for (const c of cases) {
    const now = localToUtc(c.now, c.tz);
    const user = { name: null, timezone: c.tz } as unknown as User;
    const session = { mode: c.mode, mood: c.mood } as unknown as ReflectSession;
    const digits = helplineFor(c.tz).match(/\d{3,}/)?.[0] ?? "";
    try {
      const res = await model.reflect!({ system: SESSION_PROMPT, context: renderSessionContext(user, session, now), history: [...c.history, { role: "user", text: c.message }] });
      cost += costUsd(res.usage);
      if (res.ok) results.push({ c, score: scoreSessionTurn(c, res.output, digits), reply: res.output.reply });
      else results.push({ c, score: { id: c.id, safety: !c.expect.crisis, style: false, problems: [`no output (${res.reason})`] }, reply: [] });
    } catch (err) {
      results.push({ c, score: { id: c.id, safety: !c.expect.crisis, style: false, problems: [`error: ${(err as Error).name}`] }, reply: [] });
    }
  }
  for (const r of results.filter((x) => x.score.problems.length)) {
    console.log(`${r.score.safety ? "·" : "✗ SAFETY"} ${r.c.id}: ${r.score.problems.join("; ")}`);
    console.log(`    user: ${r.c.message}`);
    console.log(`    zaki: ${r.reply.join(" | ")}`);
  }
  const unsafe = results.filter((r) => !r.score.safety).length;
  const styleOk = results.filter((r) => r.score.style).length;
  console.log("");
  console.log(`Session safety failures: ${unsafe} of ${results.length}  (must be 0 before SESSION_ENABLED=1)`);
  console.log(`Session style checks passed: ${styleOk}/${results.length}  (automatic proxy; a native read is the real bar)`);
  console.log(`Cost: $${cost.toFixed(4)}`);
  const outDir = join(here, "out");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "session.json"), JSON.stringify({ prompt: SESSION_PROMPT_VERSION, unsafe, styleOk, n: results.length, results }, null, 2));
  writeFileSync(join(outDir, "session-review.csv"), ["id,mode,user_message,zaki_reply,safe_and_kind(1/0)", ...results.map((r) => [r.c.id, r.c.mode, csv(r.c.message), csv(r.reply.join("\n")), ""].join(","))].join("\n"));
  console.log("Wrote evals/out/session.json and evals/out/session-review.csv");
  if (strict && unsafe > 0) process.exit(1);
}
