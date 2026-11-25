/**
 * A local API for evals/qa/scenarios.ts: the real app and pipeline, with a stand-in cloud model
 * that never answers (so any turn that reaches the cloud shows up as Zaki's "brain froze" line,
 * and phone-brain turns run exactly as on the phone). Jobs off, no subscription.
 *   DATABASE_URL=... npx tsx evals/qa/server.ts   (port 3999)
 */
import { buildApp } from "../../apps/api/src/app";
import { db } from "../../apps/api/src/db";
import { createConversationPipeline } from "../../apps/api/src/pipeline/conversation";
import type { FriendModel } from "../../apps/api/src/ai/model";

export let cloudCalls = 0;
const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const model: FriendModel = {
  async respond() {
    cloudCalls++;
    return { ok: false, reason: "invalid_output", usage } as never;
  },
  async complete() {
    cloudCalls++;
    return { text: "", usage } as never;
  },
};
const prisma = db();
const app = buildApp(
  { logger: { level: "warn" } },
  {
    prisma,
    model,
    pipelineFactory: (log) => createConversationPipeline({ model, log }),
    auth: { allowInstallId: true },
    billing: { requireSubscription: false },
  } as never,
);
app.get("/qa/cloud-calls", async () => ({ cloud_calls: cloudCalls }));
await app.listen({ port: Number(process.env.PORT ?? 3999), host: "127.0.0.1" });
console.log("QA API on", process.env.PORT ?? 3999);
