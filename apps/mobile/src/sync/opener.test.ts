import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createXhrOpener, fetchOpener, type XhrLike } from "./opener";
import { postForReply, StreamCutError } from "./stream";

/** A stand-in for React Native's XMLHttpRequest: the test plays the events a real one fires. */
function fakeXhr() {
  const sent: { method?: string; url?: string; headers: Record<string, string>; body?: string } = { headers: {} };
  const xhr: XhrLike & { aborted: boolean } = {
    readyState: 0,
    status: 0,
    responseText: "",
    aborted: false,
    onreadystatechange: null,
    onprogress: null,
    onload: null,
    onerror: null,
    ontimeout: null,
    onabort: null,
    open: (method, url) => void Object.assign(sent, { method, url }),
    setRequestHeader: (name, value) => void (sent.headers[name] = value),
    getResponseHeader: (name) => (name.toLowerCase() === "content-type" ? type : null),
    send: (body) => void (sent.body = body),
    abort: () => {
      xhr.aborted = true;
      xhr.onabort?.();
    },
  };
  let type = "application/json";
  return {
    xhr,
    sent,
    headers(status: number, contentType: string) {
      type = contentType;
      xhr.status = status;
      xhr.readyState = 2;
      xhr.onreadystatechange?.();
    },
    more(text: string) {
      xhr.responseText += text;
      xhr.readyState = 3;
      xhr.onreadystatechange?.();
    },
    load() {
      xhr.readyState = 4;
      xhr.onreadystatechange?.();
      xhr.onload?.();
    },
    /** As React Native does: the error's words replace the text, then "error" follows. */
    fail(words = "The network connection was lost.") {
      xhr.responseText = words;
      xhr.readyState = 4;
      xhr.onreadystatechange?.();
      xhr.onerror?.();
    },
  };
}

const req = { url: "https://api.test/messages", headers: { "x-install-id": "abc" }, body: '{"text":"hi"}', timeoutMs: 1000 };

describe("the phone's opener (XMLHttpRequest)", () => {
  it("hands on the status once and the text as it grows", async () => {
    const f = fakeXhr();
    const starts: unknown[] = [];
    const pieces: string[] = [];
    const done = createXhrOpener(() => f.xhr)({ ...req, onStart: (o) => starts.push(o), onText: (p) => pieces.push(p) });
    expect(f.sent).toMatchObject({ method: "POST", url: req.url, body: req.body, headers: { "x-install-id": "abc" } });
    // The handlers that make React Native report the text while it arrives are set before send.
    expect(f.xhr.onreadystatechange).toBeTypeOf("function");
    expect(f.xhr.onprogress).toBeTypeOf("function");
    f.headers(200, "text/event-stream; charset=utf-8");
    f.more("event: draft\n");
    f.more('data: {"i":0,"d":"hi"}\n\n');
    f.xhr.onprogress?.(); // nothing new: nothing handed on twice
    f.load();
    await done;
    expect(starts).toEqual([{ status: 200, contentType: "text/event-stream; charset=utf-8" }]);
    expect(pieces).toEqual(["event: draft\n", 'data: {"i":0,"d":"hi"}\n\n']);
  });

  it("reads a whole plain answer that only shows up at the end", async () => {
    const f = fakeXhr();
    const pieces: string[] = [];
    const done = createXhrOpener(() => f.xhr)({ ...req, onStart: () => {}, onText: (p) => pieces.push(p) });
    f.headers(201, "application/json");
    f.xhr.responseText = '{"ok":true}';
    f.load();
    await done;
    expect(pieces).toEqual(['{"ok":true}']);
  });

  it("fails when there is no answer, and never hands on the error's words as text", async () => {
    const offline = fakeXhr();
    const none = createXhrOpener(() => offline.xhr)({ ...req, onStart: () => {}, onText: () => {} });
    offline.fail();
    await expect(none).rejects.toBeInstanceOf(TypeError);

    const cut = fakeXhr();
    const pieces: string[] = [];
    const broken = createXhrOpener(() => cut.xhr)({ ...req, onStart: () => {}, onText: (p) => pieces.push(p) });
    cut.headers(200, "text/event-stream");
    cut.more("event: draft\n");
    cut.fail("The network connection was lost, and these words are longer than the text so far.");
    await expect(broken).rejects.toBeInstanceOf(TypeError);
    expect(pieces).toEqual(["event: draft\n"]);
  });

  it("gives up after its own time limit", async () => {
    vi.useFakeTimers();
    try {
      const f = fakeXhr();
      const done = createXhrOpener(() => f.xhr)({ ...req, timeoutMs: 60_000, onStart: () => {}, onText: () => {} });
      const failed = expect(done).rejects.toThrow(/timed out/);
      await vi.advanceTimersByTimeAsync(60_000);
      await failed;
      expect(f.xhr.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves no timer behind", async () => {
    vi.useFakeTimers();
    try {
      const f = fakeXhr();
      const done = createXhrOpener(() => f.xhr)({ ...req, onStart: () => {}, onText: () => {} });
      f.headers(204, "");
      f.load();
      await done;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the opener over a real connection (fetch)", () => {
  let server: Server | null = null;
  afterEach(async () => {
    server?.closeAllConnections();
    await new Promise((r) => (server ? server.close(() => r(null)) : r(null)));
    server = null;
  });
  const listen = async (handler: (req: IncomingMessage, res: ServerResponse) => void) => {
    server = createServer(handler);
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
    return `http://127.0.0.1:${server.address().port}/messages`;
  };
  const event = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;

  it("shows the words before the answer is complete", async () => {
    let finish: () => void = () => {};
    const url = await listen((request, res) => {
      expect(request.headers.accept).toContain("text/event-stream");
      res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8" });
      res.write(": zaki\n\n");
      res.write(event("draft", { i: 0, d: "أهلا " }));
      res.write(event("draft", { i: 0, d: "يا منى 💛" }));
      finish = () => res.end(event("done", { status: 201, body: { replies: 1 } }));
    });
    const seen: string[] = [];
    let sawWordsFirst = false;
    const out = await postForReply(fetchOpener, { ...req, url }, {
      onDraft: (_i, d) => {
        seen.push(d);
        // The server is still holding the end back: these words came on their own.
        if (seen.length === 2) {
          sawWordsFirst = true;
          finish();
        }
      },
      onReset: () => {},
    });
    expect(sawWordsFirst).toBe(true);
    expect(seen.join("")).toBe("أهلا يا منى 💛");
    expect(out).toEqual({ json: { replies: 1 }, streamed: true });
  });

  it("reads a plain JSON answer from a server that does not stream", async () => {
    const url = await listen((_request, res) => {
      res.writeHead(201, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ replies: 2 }));
    });
    expect(await postForReply(fetchOpener, { ...req, url }, { onDraft: () => {}, onReset: () => {} })).toEqual({ json: { replies: 2 }, streamed: false });
  });

  it("says the stream was cut when it ends without its answer", async () => {
    const url = await listen((_request, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(event("draft", { i: 0, d: "أهلا" }));
      setTimeout(() => res.destroy(), 20);
    });
    await expect(postForReply(fetchOpener, { ...req, url }, { onDraft: () => {}, onReset: () => {} })).rejects.toBeInstanceOf(StreamCutError);
  });
});
