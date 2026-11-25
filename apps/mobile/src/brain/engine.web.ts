import type { PhoneModel } from "./catalog";
import { chatModel } from "./catalog";
import type { Think } from "./flow";

/** The browser preview has no on-device model (native only). */
export const selectedModel = (): PhoneModel => chatModel(null, null);
export const phoneBrainReady = () => false;
export const unloadBrain = async () => {};
export const warmBrain = () => {};
export const thinkOnPhone: Think = async () => {
  throw new Error("no phone brain on the web");
};
