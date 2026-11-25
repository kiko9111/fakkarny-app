import * as Device from "expo-device";
import { phoneMessages, PHONE_OUTPUT_JSON_SCHEMA, extractPhoneJson, type PhoneBrainRequest } from "@fakkarni/shared";
import { prefs } from "@/lib/prefs";
import { brainAvailable } from "./native";
import { chatModel, threadsFor, type PhoneModel } from "./catalog";
import { hasModel, modelFile } from "./files";
import { usableOutput, type Think } from "./flow";

/**
 * Zaki's brain on the phone: llama.cpp through llama.rn. One context, loaded on first use and kept
 * while the app runs (loading takes a few seconds). The system prompt comes first and stays the
 * same, so llama.cpp reuses it from its cache and only reads the new part of each message.
 */
type LlamaModule = typeof import("llama.rn");
type Ctx = Awaited<ReturnType<LlamaModule["initLlama"]>>;

let loaded: { id: string; ctx: Ctx } | null = null;
let loading: Promise<Ctx> | null = null;

export const selectedModel = (): PhoneModel => chatModel(prefs.get("brain_model"), Device.totalMemory);

/** True when the phone brain is switched on and its model is on the phone. */
export function phoneBrainReady(): boolean {
  if (!brainAvailable || prefs.get("brain") !== "phone") return false;
  const m = selectedModel();
  return hasModel(m.id, m.bytes);
}

async function context(m: PhoneModel): Promise<Ctx> {
  if (loaded?.id === m.id) return loaded.ctx;
  if (loading) return loading;
  loading = (async () => {
    const llama = require("llama.rn") as LlamaModule;
    if (loaded) {
      await loaded.ctx.release().catch(() => {});
      loaded = null;
    }
    const ctx = await llama.initLlama({
      model: modelFile(m.id).uri,
      n_ctx: m.nCtx,
      // Most phones have 8 cores, half of them fast: 4 threads, so the UI stays smooth.
      n_threads: threadsFor(8),
      n_batch: 512,
      use_mlock: false,
      n_gpu_layers: 0,
    });
    loaded = { id: m.id, ctx };
    return ctx;
  })();
  try {
    return await loading;
  } finally {
    loading = null;
  }
}

/** Free the model's memory (switching back to the cloud, or removing the model). */
export async function unloadBrain() {
  const l = loaded;
  loaded = null;
  if (l) await l.ctx.release().catch(() => {});
}

/** Load the model ahead of the first message, so that one doesn't wait for it. */
export function warmBrain() {
  if (phoneBrainReady()) void context(selectedModel()).catch(() => {});
}

async function once(ctx: Ctx, req: PhoneBrainRequest, temperature: number): Promise<unknown> {
  const res = await ctx.completion({
    messages: phoneMessages(req),
    n_predict: 700,
    temperature,
    top_p: 0.9,
    response_format: { type: "json_schema", json_schema: { schema: PHONE_OUTPUT_JSON_SCHEMA as unknown as object } },
    enable_thinking: false,
  });
  return extractPhoneJson(res.text);
}

/** Think about one message: the model's JSON answer (checked), its id and how long it took. */
export const thinkOnPhone: Think = async (req) => {
  const m = selectedModel();
  const t0 = Date.now();
  const ctx = await context(m);
  let out = await once(ctx, req, 0.3);
  // One more try, steadier, if the answer doesn't fit (rare with the grammar on).
  if (!usableOutput(out)) out = await once(ctx, req, 0);
  if (!usableOutput(out)) throw new Error("phone model gave no usable answer");
  const ms = Date.now() - t0;
  prefs.set("brain_last_ms", String(ms));
  return { output: out, model: m.id, ms };
};
