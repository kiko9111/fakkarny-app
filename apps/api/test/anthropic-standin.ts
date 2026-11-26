import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A stand-in for the Messages API over a real socket, so tests run the SDK's own code (streams
 * included) without a model: what each request asked for, and a scripted answer.
 */

export interface Asked {
  stream: boolean;
  eager: boolean[];
}
export type Answer = (body: { stream?: boolean; tools?: { name: string; eager_input_streaming?: boolean }[] }, res: ServerResponse) => void | Promise<void>;

export const RESPOND = { reply: ["أهلا يا منى 💛", "عاملة إيه النهارده؟"], create_items: [], update_items: [], save_memories: [], crisis: false };
export const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The whole turn as one JSON answer. */
export const whole: Answer = (_body, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "claude-haiku-5-5",
      content: [{ type: "tool_use", id: "toolu_1", name: "respond", input: RESPOND }],
      stop_reason: "tool_use",
      stop_sequence: null,
      usage: { input_tokens: 100, output_tokens: 30 },
    }),
  );
};

const sse = (res: ServerResponse, event: Record<string, unknown>) => res.write(`event: ${String(event["type"])}\ndata: ${JSON.stringify(event)}\n\n`);

/**
 * The same turn as a stream, the tool input cut into small pieces. `upTo` stops early (and `then`
 * decides how); `waitAt` holds the stream at that piece until `wait` is over, then carries on.
 */
export const streamed =
  (opts: { upTo?: number; then?: (res: ServerResponse) => unknown; waitAt?: number; wait?: Promise<unknown> } = {}): Answer =>
  async (_body, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    sse(res, { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude-haiku-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 1 } } });
    sse(res, { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_1", name: "respond", input: {} } });
    const json = JSON.stringify(RESPOND);
    const pieces = json.match(/[\s\S]{1,7}/g) ?? [];
    for (const [n, piece] of pieces.entries()) {
      if (opts.waitAt === n) await opts.wait;
      if (opts.upTo !== undefined && n >= opts.upTo) {
        await opts.then?.(res);
        return;
      }
      sse(res, { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: piece } });
      await pause(2);
    }
    sse(res, { type: "content_block_stop", index: 0 });
    sse(res, { type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 30 } });
    sse(res, { type: "message_stop" });
    res.end();
  };

export const refuse =
  (status: number): Answer =>
  (_body, res) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify({ type: "error", error: { type: status === 400 ? "invalid_request_error" : "overloaded_error", message: "no" } }));
  };

/** Start the stand-in; `answer` picks what each request gets. `close` when the test is over. */
export async function startStandIn(answer: (asked: Asked, n: number) => Answer, port = 0) {
  const asked: Asked[] = [];
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let text = "";
    req.on("data", (c: Buffer) => (text += c.toString("utf8")));
    req.on("end", () => {
      const body = JSON.parse(text) as Parameters<Answer>[0];
      const a = { stream: body.stream === true, eager: (body.tools ?? []).map((t) => t.eager_input_streaming === true) };
      asked.push(a);
      void answer(a, asked.length - 1)(body, res);
    });
  });
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
  return {
    asked,
    baseURL: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise((r) => server.close(() => r(null)));
    },
  };
}
