import { defaultVoiceModel, type VoiceModel } from "@/brain/catalog";

/** No voice typing in the browser preview (native only). */
export const voiceModel = (): VoiceModel => defaultVoiceModel(null);
export const voiceReady = () => false;
export const micPermission = async () => false;
export const startListening = async () => {};
export const stopListening = async (_lang: "ar" | "en") => "";
export const isListening = () => false;
