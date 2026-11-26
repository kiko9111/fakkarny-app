import { describe, expect, it } from "vitest";
import { HttpError } from "./queue";
import { createStreamSwitch, postForReply, STREAM_ACCEPT, StreamCutError, type Opener } from "./stream";

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
  it("switches streaming off for a while after a stream was cut, and only then", () => {
    const sw = createStreamSwitch(1000);
    expect(sw.wanted(0)).toBe(true);
    sw.failed(new TypeError("Network request failed"), 10);
    sw.failed(new HttpError(500), 10);
    expect(sw.wanted(11)).toBe(true);
    sw.failed(new StreamCutError(), 20);
    expect(sw.wanted(21)).toBe(false);
    expect(sw.wanted(1019)).toBe(false);
    expect(sw.wanted(1020)).toBe(true);
  });
});
