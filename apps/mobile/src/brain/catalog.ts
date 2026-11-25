/**
 * Models Zaki can run on the phone (Android test mode, 2026-11-25). Pure data + picks, so the
 * choice is unit-tested. Downloaded once after install (never shipped in the app), from Hugging
 * Face, into the app's own documents folder. Change a URL here and it reaches phones over the air.
 */
export interface PhoneModel {
  id: string;
  /** Shown in Settings next to the size. "balanced" | "small" picks the i18n label. */
  tier: "balanced" | "small";
  name: string;
  url: string;
  bytes: number;
  /** Below this much RAM the phone can't hold the model and the app at once. */
  minRamGb: number;
  /** Context window we ask for (the prompt is ~2.5k tokens, the answer ≤700). */
  nCtx: number;
}

export const CHAT_MODELS: PhoneModel[] = [
  {
    id: "qwen3.5-2b-q4",
    tier: "balanced",
    name: "Qwen3.5 2B",
    url: "https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/main/Qwen3.5-2B-Q4_K_M.gguf",
    bytes: 1_280_835_840,
    minRamGb: 5.5,
    nCtx: 4096,
  },
  {
    id: "qwen3.5-0.8b-q4",
    tier: "small",
    name: "Qwen3.5 0.8B",
    url: "https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/main/Qwen3.5-0.8B-Q4_K_M.gguf",
    bytes: 532_517_120,
    minRamGb: 3,
    nCtx: 4096,
  },
];

export interface VoiceModel {
  id: string;
  name: string;
  url: string;
  bytes: number;
  minRamGb: number;
}

/** Whisper (whisper.cpp) multilingual models: small reads Egyptian Arabic far better than base. */
export const VOICE_MODELS: VoiceModel[] = [
  { id: "whisper-small-q5", name: "Whisper small", url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin", bytes: 190_085_487, minRamGb: 3 },
  { id: "whisper-base-q5", name: "Whisper base", url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin", bytes: 59_707_625, minRamGb: 0 },
];

export const ramGb = (bytes: number | null | undefined) => (bytes ? Math.round((bytes / 1024 ** 3) * 10) / 10 : null);

/** The model to offer first: the smartest one this phone has room for (RAM unknown = the small one). */
export function defaultChatModel(totalRamBytes: number | null | undefined): PhoneModel {
  const gb = ramGb(totalRamBytes);
  if (gb === null) return CHAT_MODELS.find((m) => m.tier === "small")!;
  return CHAT_MODELS.find((m) => gb >= m.minRamGb) ?? CHAT_MODELS[CHAT_MODELS.length - 1]!;
}

export function chatModel(id: string | null | undefined, totalRamBytes?: number | null): PhoneModel {
  return CHAT_MODELS.find((m) => m.id === id) ?? defaultChatModel(totalRamBytes);
}

export function defaultVoiceModel(totalRamBytes: number | null | undefined): VoiceModel {
  const gb = ramGb(totalRamBytes) ?? 0;
  return VOICE_MODELS.find((m) => gb >= m.minRamGb) ?? VOICE_MODELS[VOICE_MODELS.length - 1]!;
}

/** "1.3 GB" / "190 MB". */
export function sizeLabel(bytes: number): string {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`;
}

/** Threads for llama.cpp: big cores only (phones have 2–4), never all of them, or the UI stutters. */
export function threadsFor(cpuCount: number | null | undefined): number {
  const n = cpuCount ?? 4;
  return Math.max(2, Math.min(4, Math.floor(n / 2)));
}
