import { router } from "expo-router";

/**
 * Uses up a word in the link. When the screen is the app's very first one the router is not
 * ready yet and `setParams` throws: the word then stays, which only means the same arrival again.
 */
export function clearParam(params: Record<string, undefined>) {
  try {
    router.setParams(params);
  } catch {
    // Not ready yet.
  }
}
