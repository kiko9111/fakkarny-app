import { describe, expect, it } from "vitest";
import { HttpError } from "./queue";
import { createStreamSwitch, postForReply, sendForReply, STREAM_ACCEPT, StreamCutError, type Opener } from "./stream";

/** A transport that answers with `status`, `contentType` and the body in `pieces`; `fail` rejects after them. */
function answer(status: number, contentType: string, pieces: string[], fail?: Error): Opener & { seen: { headers?: Record<string, string> } } {
  const seen: { headers?: Record<string, string> } = {};
  const open: Opener = async (req) => {
    seen.headers = req.headers;
    req.onStart({ status, contentType });
    for (const p of pieces) req.onText(p);
    if (fail) throw fail;
  };
  return Object.assign(open, { seen });
}

const req = { url: "https://api.test/messages", headers: { "x-install-id": "abc" }, body: "{}", timeoutMs: 1000 };

function collect() {
  const drafts: [number, string][] = [];
  let resets = 0;
  return { drafts, get resets() { return resets; }, handlers: { onDraft: (i: number, d: string) => void drafts.push([i, d]), onReset: () => void resets++ } };
}

const sse = (events: [string, unknown][]) => events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join("");

describe("postForReply", () => {
  it("asks for a stream and keeps the caller's headers", async () => {
    const open = answer(201, "application/json", ['{"ok":true}']);
    await postForReply(open, req, collect().handlers);
    expect(open.seen.headers).toEqual({ "x-install-id": "abc", accept: STREAM_ACCEPT });
  });

  it("reads a plain JSON answer as before", async () => {
    const c = collect();
    const out = await postForReply(answer(201, "application/json; charset=utf-8", ['{"message":', '{"id":"1"}}']), req, c.handlers);
    expect(out).toEqual({ json: { message: { id: "1" } }, streamed: false });
    expect(c.drafts).toEqual([]);
  });

  it("throws the status of a plain answer that is not 2xx", async () => {
    await expect(postForReply(answer(429, "application/json", ['{"error":"x"}']), req, collect().handlers)).rejects.toMatchObject({ status: 429 });
    await expect(postForReply(answer(500, "text/html", ["<h1>no</h1>"]), req, collect().handlers)).rejects.toBeInstanceOf(HttpError);
  });

  it("passes the draft on as it arrives and resolves with the finished answer", async () => {
    const c = collect();
    const body = { message: { id: "1" }, replies: [{ id: "2", text: "أهلا يا منى" }] };
    const text = `: zaki\n\n${sse([["draft", { i: 0, d: "أهلا " }], ["draft", { i: 0, d: "يا منى" }], ["done", { status: 201, body }]])}`;
    // Cut anywhere, the same result.
    for (const cut of [0, 5, 30, 61, text.length]) {
      const each = collect();
      const out = await postForReply(answer(200, "text/event-stream; charset=utf-8", [text.slice(0, cut), text.slice(cut)]), req, each.handlers);
      expect(out).toEqual({ json: body, streamed: true });
      expect(each.drafts.map(([, d]) => d).join("")).toBe("أهلا يا منى");
    }
    const out = await postForReply(answer(200, "text/event-stream", [text]), req, c.handlers);
    expect(out.streamed).toBe(true);
    expect(c.drafts).toEqual([
      [0, "أهلا "],
      [0, "يا منى"],
    ]);
  });

  it("tells the chat to forget the draft when the reply is rewritten", async () => {
    const c = collect();
    await postForReply(answer(200, "text/event-stream", [sse([["draft", { i: 0, d: "one" }], ["reset", {}], ["draft", { i: 0, d: "two" }], ["done", { status: 201, body: {} }]])]), req, c.handlers);
    expect(c.resets).toBe(1);
    expect(c.drafts).toEqual([
      [0, "one"],
      [0, "two"],
    ]);
  });

  it("throws the status carried by an error event, or by a done that is not 2xx", async () => {
    await expect(postForReply(answer(200, "text/event-stream", [sse([["draft", { i: 0, d: "x" }], ["error", { status: 500 }]])]), req, collect().handlers)).rejects.toMatchObject({ status: 500 });
    await expect(postForReply(answer(200, "text/event-stream", [sse([["done", { status: 409, body: { error: "duplicate_in_flight" } }]])]), req, collect().handlers)).rejects.toMatchObject({ status: 409 });
  });

  it("says the stream was cut when it ends without an answer", async () => {
    const half = sse([["draft", { i: 0, d: "half" }]]);
    await expect(postForReply(answer(200, "text/event-stream", [half]), req, collect().handlers)).rejects.toBeInstanceOf(StreamCutError);
    // The connection dropped after the stream began.
    await expect(postForReply(answer(200, "text/event-stream", [half], new TypeError("Network request failed")), req, collect().handlers)).rejects.toBeInstanceOf(StreamCutError);
  });

  it("passes a failure with no answer through untouched", async () => {
    const offline: Opener = async () => {
      throw new TypeError("Network request failed");
    };
    await expect(postForReply(offline, req, collect().handlers)).rejects.toBeInstanceOf(TypeError);
    // The connection dropped during a plain answer: also not the stream's doing.
    await expect(postForReply(answer(201, "application/json", ['{"mess'], new TypeError("Network request failed")), req, collect().handlers)).rejects.toBeInstanceOf(TypeError);
  });

  it("ignores events that are damaged, out of range or come after the end", async () => {
    const c = collect();
    const text =
      "event: draft\ndata: {not json\n\n" +
      sse([["draft", { i: -1, d: "x" }], ["draft", { i: 99, d: "x" }], ["draft", { i: 0, d: "" }], ["draft", { i: 0 }], ["draft", { i: 0, d: "ok" }], ["done", { status: 201, body: { a: 1 } }], ["draft", { i: 0, d: "late" }], ["done", { status: 500, body: null }]]);
    const out = await postForReply(answer(200, "text/event-stream", [text]), req, c.handlers);
    expect(out).toEqual({ json: { a: 1 }, streamed: true });
    expect(c.drafts).toEqual([[0, "ok"]]);
  });
});

describe("createStreamSwitch", () => {
  it("asks for a stream only from a server that says it sends one", () => {
    const sw = createStreamSwitch();
    // A server from before streams never says so: every send is the plain one it always was.
    expect(sw.wanted(0)).toBe(false);
    sw.offer(true);
    expect(sw.offered).toBe(true);
    expect(sw.wanted(0)).toBe(true);
    // Taken away on the server: the asking stops with the next answer, no app update.
    sw.offer(false);
    expect(sw.wanted(0)).toBe(false);
    // What it said before this start of the app.
    expect(createStreamSwitch({ offered: true }).wanted(0)).toBe(true);
  });

  it("switches streaming off for a while after a stream was cut", () => {
    const sw = createStreamSwitch({ offForMs: 1000, offered: true });
    sw.failed(new HttpError(500), 10);
    sw.failed(new HttpError(0), 10);
    expect(sw.wanted(11)).toBe(true);
    sw.failed(new StreamCutError(), 20);
    expect(sw.wanted(21)).toBe(false);
    expect(sw.wanted(1019)).toBe(false);
    expect(sw.wanted(1020)).toBe(true);
  });

  it("finds out with a plain send whether no answer was the stream or the connection", () => {
    const sw = createStreamSwitch({ offForMs: 1000, offered: true });
    // No answer at all: the next send goes the plain way.
    sw.failed(new TypeError("Network request failed"), 10);
    expect(sw.wanted(11)).toBe(false);
    // It was not answered either: the connection. Streams are asked for again.
    sw.plain(false, 12);
    expect(sw.wanted(13)).toBe(true);

    // This time the plain send is answered: it was the stream. Off for a while.
    sw.failed(new TypeError("Network request timed out"), 20);
    sw.plain(true, 30);
    expect(sw.wanted(31)).toBe(false);
    expect(sw.wanted(1029)).toBe(false);
    expect(sw.wanted(1030)).toBe(true);

    // A plain send that works says nothing when no stream failed before it.
    sw.plain(true, 2000);
    expect(sw.wanted(2001)).toBe(true);
  });
});

describe("sendForReply", () => {
  /** One send with scripted tries; `clock` moves when a try says how long it took. */
  function setup(opts: { offered?: boolean; stream?: () => Promise<string>; plain?: () => Promise<string> }) {
    let now = 0;
    const calls: string[] = [];
    const sw = createStreamSwitch({ offForMs: 10_000, offered: opts.offered ?? true });
    const send = () =>
      sendForReply({
        switch: sw,
        now: () => now,
        limitMs: 60_000,
        stream: async () => {
          calls.push("stream");
          return (opts.stream ?? (async () => "streamed"))();
        },
        plain: async () => {
          calls.push("plain");
          return (opts.plain ?? (async () => "plain"))();
        },
        onGiveUp: () => void calls.push("give up"),
      });
    return { calls, sw, send, pass: (ms: number) => void (now += ms), at: () => now };
  }

  it("sends the plain way to a server that does not say it streams", async () => {
    const t = setup({ offered: false });
    expect(await t.send()).toBe("plain");
    expect(t.calls).toEqual(["plain"]);
  });

  it("reads the reply as it is written from a server that does", async () => {
    const t = setup({});
    expect(await t.send()).toBe("streamed");
    expect(t.calls).toEqual(["stream"]);
    expect(t.sw.wanted(t.at())).toBe(true);
  });

  it("tries the plain way at once when a streamed send gets no answer, and then leaves streams alone for a while", async () => {
    const t = setup({
      stream: async () => {
        throw new TypeError("Network request failed");
      },
    });
    // Answered as it always was: this phone's stream reading is what failed.
    expect(await t.send()).toBe("plain");
    expect(t.calls).toEqual(["stream", "give up", "plain"]);
    expect(t.sw.wanted(t.at())).toBe(false);
    // The next message does not try the stream first.
    expect(await t.send()).toBe("plain");
    expect(t.calls).toEqual(["stream", "give up", "plain", "plain"]);
    t.pass(10_000);
    expect(t.sw.wanted(t.at())).toBe(true);
  });

  it("fails as before with no connection, and keeps asking for streams", async () => {
    const offline = async (): Promise<string> => {
      throw new TypeError("Network request failed");
    };
    const t = setup({ stream: offline, plain: offline });
    await expect(t.send()).rejects.toBeInstanceOf(TypeError);
    expect(t.calls).toEqual(["stream", "give up", "plain"]);
    // Nothing was learned about the stream: back online, it is asked for again.
    expect(t.sw.wanted(t.at())).toBe(true);
  });

  it("sends a message whose stream was cut again at once, the plain way", async () => {
    const t = setup({
      stream: async () => {
        throw new StreamCutError();
      },
    });
    expect(await t.send()).toBe("plain");
    expect(t.calls).toEqual(["stream", "give up", "plain"]);
    expect(t.sw.wanted(t.at())).toBe(false);
  });

  it("does not try twice when the server answered with a status", async () => {
    for (const status of [500, 429, 409, 401, 0]) {
      const t = setup({
        stream: async () => {
          throw new HttpError(status);
        },
      });
      await expect(t.send()).rejects.toMatchObject({ status });
      expect(t.calls).toEqual(["stream"]);
      expect(t.sw.wanted(t.at())).toBe(true);
    }
  });

  it("leaves the second try to the outbox when the first used up the time, and that one goes the plain way", async () => {
    let t!: ReturnType<typeof setup>;
    t = setup({
      stream: async () => {
        t.pass(60_000);
        throw new TypeError("Network request timed out");
      },
    });
    await expect(t.send()).rejects.toBeInstanceOf(TypeError);
    expect(t.calls).toEqual(["stream"]);
    // The outbox sends again: plain. Answered, so it was the stream that hung.
    expect(await t.send()).toBe("plain");
    expect(t.calls).toEqual(["stream", "plain"]);
    expect(t.sw.wanted(t.at())).toBe(false);
  });

  it("hands on the plain try's own failure", async () => {
    const t = setup({
      stream: async () => {
        throw new StreamCutError();
      },
      plain: async () => {
        throw new HttpError(503);
      },
    });
    await expect(t.send()).rejects.toMatchObject({ status: 503 });
    expect(t.calls).toEqual(["stream", "give up", "plain"]);
  });
});
