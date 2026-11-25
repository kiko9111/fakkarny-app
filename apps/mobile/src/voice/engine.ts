import * as Device from "expo-device";
import { requireOptionalNativeModule } from "expo";
import { PermissionsAndroid } from "react-native";
import { defaultVoiceModel, type VoiceModel } from "@/brain/catalog";
import { hasModel, modelFile } from "@/brain/files";
import { voiceAvailable } from "@/brain/native";
import { base64ToBytes, cleanTranscript, joinChunks, peak, seconds } from "./pcm";

/**
 * Voice typing, fully on the phone (owner decision 2026-11-25): the microphone's audio stays in
 * memory, whisper.cpp turns it into text, and the audio is dropped. Nothing is saved or sent; only
 * the text lands in the composer, where the user reads it before sending.
 */
/** The few whisper.rn calls used here (typed by hand: its source doesn't typecheck in this project). */
interface WhisperCtx {
  transcribeData(data: ArrayBuffer, o: { language?: string; maxThreads?: number; prompt?: string }): { stop(): Promise<void>; promise: Promise<{ result: string }> };
}
interface WhisperModule {
  initWhisper(o: { filePath: string }): Promise<WhisperCtx>;
}
/** modules/zaki-mic: 16 kHz mono 16-bit PCM in memory; stop() hands it over as base64 and forgets it. */
interface Mic {
  start(): boolean;
  stop(): string;
}

export const voiceModel = (): VoiceModel => defaultVoiceModel(Device.totalMemory);
export const voiceReady = () => voiceAvailable() && hasModel(voiceModel().id, voiceModel().bytes);

let whisper: { id: string; ctx: WhisperCtx } | null = null;
let recording = false;
let timer: ReturnType<typeof setTimeout> | null = null;

const mic = () => requireOptionalNativeModule<Mic>("ZakiMic")!;

async function context(): Promise<WhisperCtx> {
  const m = voiceModel();
  if (whisper?.id === m.id) return whisper.ctx;
  const { initWhisper } = require("whisper.rn/index") as WhisperModule;
  const ctx = await initWhisper({ filePath: modelFile(m.id).uri });
  whisper = { id: m.id, ctx };
  return ctx;
}

/** Ask for the microphone (Android shows its own dialog). */
export async function micPermission(): Promise<boolean> {
  const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  return r === PermissionsAndroid.RESULTS.GRANTED;
}

export async function startListening(): Promise<void> {
  if (recording) return;
  void context().catch(() => {}); // load whisper while the user talks
  mic().start();
  recording = true;
  // The recorder keeps 60 s at most; past that the user surely forgot it, so the mic goes off.
  timer = setTimeout(() => {
    if (recording) {
      recording = false;
      mic().stop();
    }
  }, 61_000);
}

/** Stop and write down what was said ("" when nothing was). Language "ar" / "en" from the app. */
export async function stopListening(lang: "ar" | "en"): Promise<string> {
  if (!recording) return "";
  recording = false;
  if (timer) clearTimeout(timer);
  timer = null;
  const audio = joinChunks([base64ToBytes(mic().stop())]);
  if (seconds(audio.byteLength) < 0.4 || peak(audio) < 0.01) return "";
  const ctx = await context();
  const { promise } = ctx.transcribeData(audio, {
    language: lang,
    maxThreads: 4,
    // A nudge toward colloquial Egyptian spelling (and the app's words) instead of formal Arabic.
    prompt: lang === "ar" ? "فكرني بكرة الساعة ٥، صرفت ٣٠٠ جنيه، عايز أعمل منبه، ماما، الولاد." : "Remind me tomorrow at 5, I spent 300 pounds.",
  });
  const { result } = await promise;
  return cleanTranscript(result ?? "");
}

export const isListening = () => recording;
