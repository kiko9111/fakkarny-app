import { createEmitter } from "@/lib/emitter";
import { prefs } from "@/lib/prefs";

/**
 * A message from WhatsApp waiting for the chat: shared to Zaki from another app or pasted on the
 * "From WhatsApp" screen. It is kept in prefs, so a share that opens the app before sign-in, or
 * while the chat is not mounted, is still sent once the chat is open. The text already carries
 * the forward mark (@fakkarni/shared forward.ts).
 */
export const forwardArrived = createEmitter<void>();

export function parkForward(text: string) {
  prefs.set("pending_forward", text);
  forwardArrived.emit();
}

/** The waiting message, once: the chat sends it. */
export function takeForward(): string | null {
  const text = prefs.get("pending_forward");
  if (text) prefs.set("pending_forward", null);
  return text;
}
