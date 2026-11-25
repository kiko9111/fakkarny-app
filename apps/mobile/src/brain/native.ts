import { requireOptionalNativeModule } from "expo";
import { Platform, TurboModuleRegistry } from "react-native";

/**
 * The on-device brain and voice typing need native code that only builds made after 2026-11-25
 * have (llama.rn, whisper.rn, modules/zaki-mic). Older builds still take JavaScript over the air,
 * so everything here checks first and loads the modules lazily: requiring them on a build without
 * them would crash. Android only for now (owner decision 2026-11-25; iPhone later).
 */
const has = (name: string) => {
  try {
    return TurboModuleRegistry.get(name) != null;
  } catch {
    return false;
  }
};

export const brainAvailable = Platform.OS === "android" && has("RNLlama");

/** Voice typing: whisper.rn plus the app's own small mic module (modules/zaki-mic). */
export function voiceAvailable(): boolean {
  return Platform.OS === "android" && has("RNWhisper") && requireOptionalNativeModule("ZakiMic") != null;
}
