import * as Device from "expo-device";
import { cleanPhoneReply, phoneMessages, PhoneOutput, PHONE_OUTPUT_JSON_SCHEMA, extractPhoneJson, type PhoneBrainRequest } from "@fakkarni/shared";
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
    // Reply mode (the server's code already did the work) needs far fewer tokens.
    n_predict: req.schema ? 260 : 700,
    temperature,
    top_p: 0.9,
    response_format: { type: "json_schema", json_schema: { schema: (req.schema ?? PHONE_OUTPUT_JSON_SCHEMA) as unknown as object } },
    enable_thinking: false,
  });
  return extractPhoneJson(res.text);
}

/**
 * The longest the phone's model may think about one message. Past it, cloud Zaki answers (unless
 * the fallback is off): kareem's Pixel 8 left messages on "Sending…" for minutes, and 20 s still
 * felt broken (2026-11-25). Small talk on the 0.8B model takes 3-6 s when it works.
 */
export const THINK_LIMIT_MS = 10_000;

/** A reply the server would keep: it parses, and a bubble passes the same check (script, Modern Standard, junk). */
function goodReply(out: unknown, req: PhoneBrainRequest): boolean {
  if (!usableOutput(out)) return false;
  if (!req.lang) return true;
  const parsed = PhoneOutput.safeParse(out);
  return parsed.success && cleanPhoneReply(parsed.data.reply, req.lang).length > 0;
}

async function think(ctx: Ctx, req: PhoneBrainRequest, deadline: number): Promise<unknown> {
  let out = await once(ctx, req, 0.3);
  // One more try, steadier, if the answer doesn't fit and there is time for it.
  if (!goodReply(out, req) && Date.now() < deadline - 4_000) out = await once(ctx, req, 0);
  if (!goodReply(out, req)) throw new Error("phone model gave no usable answer");
  return out;
}

/** Think about one message: the model's JSON answer (checked), its id and how long it took. */
export const thinkOnPhone: Think = async (req) => {
  const m = selectedModel();
  const t0 = Date.now();
  const ctx = await context(m);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      void ctx.stopCompletion?.().catch(() => {});
      reject(new Error("phone model took too long"));
    }, THINK_LIMIT_MS);
  });
  try {
    const out = await Promise.race([think(ctx, req, t0 + THINK_LIMIT_MS), limit]);
    const ms = Date.now() - t0;
    prefs.set("brain_last_ms", String(ms));
    return { output: out, model: m.id, ms };
  } finally {
    clearTimeout(timer);
  }
};
