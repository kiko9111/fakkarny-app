import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { createStreamModes, readToolTurn, ReplyStreamTimeout, streamModeFromEnv, type ToolTurnStream } from "./respond-stream";

type Event = Anthropic.MessageStreamEvent;

const start = (index: number, name: string) => ({ type: "content_block_start", index, content_block: { type: "tool_use", id: `t${index}`, name, input: {} } }) as unknown as Event;
const json = (index: number, partial_json: string) => ({ type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json } }) as unknown as Event;
const text = (index: number, t: string) => ({ type: "content_block_delta", index, delta: { type: "text_delta", text: t } }) as unknown as Event;
const stop = (index: number) => ({ type: "content_block_stop", index }) as unknown as Event;

const FINAL = { id: "msg", content: [], stop_reason: "tool_use" } as unknown as Anthropic.Message;

/** A stream that plays `events` and then ends as told. */
function fake(events: Event[], end: { fail?: unknown; never?: boolean } = {}) {
  let listener: ((e: Event) => void) | null = null;
  let aborted: ((err: unknown) => void) | null = null;
  const stream: ToolTurnStream & { abort: ReturnType<typeof vi.fn> } = {
    on(_event, l) {
      listener = l;
      return stream;
    },
    abort: vi.fn(() => aborted?.(new Error("Request was aborted."))),
    async finalMessage() {
      for (const e of events) listener?.(e);
      if (end.never) return new Promise<Anthropic.Message>((_, reject) => (aborted = reject));
      if (end.fail) throw end.fail;
      return FINAL;
    },
  };
  return stream;
}

function collect() {
  const words: [number, string][] = [];
  let ends = 0;
  return { words, get ends() { return ends; }, live: { onReply: (b: number, d: string) => void words.push([b, d]), onReplyEnd: () => void ends++ } };
}

describe("readToolTurn", () => {
  it("passes on the reply of the respond call as it is written, and returns the finished message", async () => {
    const c = collect();
    const out = await readToolTurn(
      fake([start(0, "respond"), json(0, '{"reply":["أهلا '), json(0, 'يا منى","تمام'), json(0, '"],"create_items":[],"crisis":false}'), stop(0)]),
      c.live,
      { timeoutMs: 1000 },
    );
    expect(out).toBe(FINAL);
    expect(c.words).toEqual([
      [0, "أهلا "],
      [0, "يا منى"],
      [1, "تمام"],
    ]);
    expect(c.ends).toBe(1);
  });

  it("reads only the respond call, wherever it sits among the others", async () => {
    const c = collect();
    await readToolTurn(
      fake([
        text(0, "thinking out loud"),
        start(1, "money"),
        json(1, '{"action":"log","reply":["not this"]}'),
        stop(1),
        start(2, "respond"),
        json(2, '{"reply":["this"]'),
        start(3, "tracker"),
        json(3, '{"reply":["nor this"]}'),
        json(2, ',"crisis":false}'),
        stop(2),
      ]),
      c.live,
      { timeoutMs: 1000 },
    );
    expect(c.words).toEqual([[0, "this"]]);
    expect(c.ends).toBe(1);
  });

  it("says the reply ended when the call closes without one", async () => {
    const c = collect();
    await readToolTurn(fake([start(0, "respond"), json(0, '{"crisis":false'), stop(0)]), c.live, { timeoutMs: 1000 });
    expect(c.words).toEqual([]);
    expect(c.ends).toBe(1);
  });

  it("carries on when showing the words fails", async () => {
    const live = {
      onReply: () => {
        throw new Error("the phone went away");
      },
      onReplyEnd: () => {
        throw new Error("still gone");
      },
    };
    await expect(readToolTurn(fake([start(0, "respond"), json(0, '{"reply":["hi"]}'), stop(0)]), live, { timeoutMs: 1000 })).resolves.toBe(FINAL);
  });

  it("passes a failure of the stream through", async () => {
    const boom = Object.assign(new Error("overloaded"), { status: 529 });
    await expect(readToolTurn(fake([start(0, "respond"), json(0, '{"reply":["hi')], { fail: boom }), collect().live, { timeoutMs: 1000 })).rejects.toBe(boom);
  });

  it("stops a stream that takes too long and says so", async () => {
    vi.useFakeTimers();
    try {
      const stream = fake([start(0, "respond"), json(0, '{"reply":["slow')], { never: true });
      const c = collect();
      const turn = readToolTurn(stream, c.live, { timeoutMs: 25_000 });
      const failed = expect(turn).rejects.toBeInstanceOf(ReplyStreamTimeout);
      await vi.advanceTimersByTimeAsync(25_000);
      await failed;
      expect(stream.abort).toHaveBeenCalledTimes(1);
      expect(c.words).toEqual([[0, "slow"]]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves no timer behind", async () => {
    vi.useFakeTimers();
    try {
      await readToolTurn(fake([]), collect().live, { timeoutMs: 25_000 });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("createStreamModes", () => {
  it("steps down one mode per refusal and stays off", () => {
    const m = createStreamModes();
    expect(m.mode).toBe("eager");
    m.refused();
    expect(m.mode).toBe("plain");
    m.refused();
    expect(m.mode).toBe("off");
    m.refused();
    expect(m.mode).toBe("off");
  });

  it("pauses after two broken streams in a row, then tries again", () => {
    let now = 1_000;
    const m = createStreamModes("eager", () => now);
    m.broke();
    expect(m.mode).toBe("eager");
    // A good turn in between: the count starts over.
    m.worked();
    m.broke();
    expect(m.mode).toBe("eager");
    m.broke();
    expect(m.mode).toBe("off");
    now += 9 * 60_000;
    expect(m.mode).toBe("off");
    now += 60_000;
    expect(m.mode).toBe("eager");
    // Still broken on the first try after the pause: paused again at once.
    m.broke();
    expect(m.mode).toBe("off");
    now += 10 * 60_000;
    m.worked();
    m.broke();
    expect(m.mode).toBe("eager");
  });

  it("keeps a refusal's step down through a pause", () => {
    let now = 0;
    const m = createStreamModes("eager", () => now);
    m.refused();
    m.broke();
    m.broke();
    expect(m.mode).toBe("off");
    now += 10 * 60_000;
    expect(m.mode).toBe("plain");
  });

  it("starts where the environment says", () => {
    expect(streamModeFromEnv(undefined)).toBe("eager");
    expect(streamModeFromEnv("1")).toBe("eager");
    expect(streamModeFromEnv("plain")).toBe("plain");
    expect(streamModeFromEnv("0")).toBe("off");
    expect(createStreamModes(streamModeFromEnv("plain")).mode).toBe("plain");
  });
});
