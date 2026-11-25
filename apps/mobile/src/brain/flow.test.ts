import { describe, expect, it } from "vitest";
import type { PostMessageRequest, PostMessageResponse } from "@fakkarni/shared";
import { sendWithBrain, usableOutput } from "./flow";

const body: PostMessageRequest = { client_id: "c1", text: "hi", created_at: "2026-11-25T10:00:00.000Z" };
const done = { message: {}, replies: [], items: [], memories: [], duplicate: false } as unknown as PostMessageResponse;
const need = { needs_brain: { system: "S", context: "C", history: [{ role: "user", text: "hi" }], persona: "p" } };

function recorder(answers: unknown[]) {
  const sent: PostMessageRequest[] = [];
  return { sent, post: async (b: PostMessageRequest) => (sent.push(b), answers.shift()) };
}

describe("sendWithBrain", () => {
  it("sends to the cloud when the phone brain is off", async () => {
    const r = recorder([done]);
    await sendWithBrain(body, { post: r.post, parse: (x) => x as PostMessageResponse, think: null, fallback: true });
    expect(r.sent).toEqual([body]);
  });

  it("thinks on the phone when the server asks, then sends the answer", async () => {
    const r = recorder([need, done]);
    let ms = 0;
    await sendWithBrain(body, { post: r.post, parse: (x) => x as PostMessageResponse, think: async () => ({ output: { reply: ["hey"], crisis: false }, model: "m", ms: 1200 }), fallback: true, onThought: (x) => (ms = x) });
    expect(r.sent[0]).toMatchObject({ brain: "phone" });
    expect(r.sent[1]).toMatchObject({ brain: "phone", phone_output: { reply: ["hey"] }, phone_model: "m" });
    expect(ms).toBe(1200);
  });

  it("takes a rules answer straight away", async () => {
    const r = recorder([done]);
    await sendWithBrain(body, { post: r.post, parse: (x) => x as PostMessageResponse, think: async () => { throw new Error("not called"); }, fallback: true });
    expect(r.sent).toHaveLength(1);
  });

  it("falls back to cloud Zaki when the phone model fails, or throws when fallback is off", async () => {
    const r = recorder([need, done]);
    await sendWithBrain(body, { post: r.post, parse: (x) => x as PostMessageResponse, think: async () => { throw new Error("oom"); }, fallback: true });
    expect(r.sent[1]).toEqual(body);
    const r2 = recorder([need]);
    await expect(sendWithBrain(body, { post: r2.post, parse: (x) => x as PostMessageResponse, think: async () => { throw new Error("oom"); }, fallback: false })).rejects.toThrow("oom");
  });

  it("checks a model answer before sending it", () => {
    expect(usableOutput({ reply: ["x"], crisis: false })).toBe(true);
    expect(usableOutput({ reply: [] })).toBe(false);
    expect(usableOutput(null)).toBe(false);
  });
});
