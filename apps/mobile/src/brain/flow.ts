import { NeedsBrainResponse, PhoneOutput, type PhoneBrainRequest, type PostMessageRequest, type PostMessageResponse } from "@fakkarni/shared";

/**
 * Sending a chat message when Zaki's brain is on the phone (pure: transport and model injected).
 *
 * 1. POST with brain "phone". Rules (yes/no, money and tracker shortcuts) may answer at once (201).
 * 2. Otherwise the server answers 202 with what the phone's model needs; the phone thinks.
 * 3. POST again with the answer; the server checks it and applies it like a cloud answer.
 * If the phone model fails (or isn't ready), the message goes to cloud Zaki unless fallback is off,
 * in which case the error is thrown and the outbox retries later.
 */
export type Post = (body: PostMessageRequest) => Promise<unknown>;
export type Think = (req: PhoneBrainRequest) => Promise<{ output: unknown; model: string; ms: number }>;

export async function sendWithBrain(
  body: PostMessageRequest,
  deps: { post: Post; parse: (raw: unknown) => PostMessageResponse; think: Think | null; fallback: boolean; onThought?: (ms: number) => void },
): Promise<PostMessageResponse> {
  if (!deps.think) return deps.parse(await deps.post(body));
  const first = await deps.post({ ...body, brain: "phone" });
  const need = NeedsBrainResponse.safeParse(first);
  if (!need.success) return deps.parse(first);
  try {
    const thought = await deps.think(need.data.needs_brain);
    deps.onThought?.(thought.ms);
    return deps.parse(await deps.post({ ...body, brain: "phone", phone_output: thought.output, phone_model: thought.model }));
  } catch (err) {
    if (!deps.fallback) throw err;
    // Cloud Zaki answers this one: the same client_id, so it is still one message.
    return deps.parse(await deps.post(body));
  }
}

/** A model answer is usable when it parses as PhoneOutput (the server checks again, strictly). */
export function usableOutput(raw: unknown): boolean {
  return raw !== null && PhoneOutput.safeParse(raw).success;
}
