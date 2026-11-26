import { type AddressInfo, connect } from "node:net";
import { describe, expect, it } from "vitest";
import { buildApp } from "../app";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** More than the network's buffers take at once, so the end of the answer waits to be written. */
const BIG = "z".repeat(8 * 1024 * 1024);

/**
 * The app with two routes that answer when told to: a plain reply, and one written as it goes
 * (a streamed chat turn takes the answer away from Fastify the same way). A caller on a raw
 * connection that it keeps (keep-alive), as a deploy's proxy does, and that can stop reading
 * for a while, as a slow phone does.
 */
async function setUp(path: "/big" | "/stream") {
  const app = buildApp({ logger: false }, { rateLimitPerMinute: false });
  let answer!: () => void;
  const gate = new Promise<void>((resolve) => (answer = resolve));
  app.get("/big", async (_req, reply) => {
    await gate;
    return reply.type("text/plain").send(BIG);
  });
  app.get("/stream", async (_req, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, { "content-type": "text/event-stream" });
    reply.raw.write("event: draft\ndata: {}\n\n");
    await gate;
    reply.raw.end(`event: done\ndata: ${JSON.stringify(BIG)}\n\n`);
  });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const socket = connect((app.server.address() as AddressInfo).port, "127.0.0.1");
  const chunks: Buffer[] = [];
  socket.on("data", (chunk: Buffer) => chunks.push(chunk));
  socket.on("error", () => {});
  const gone = new Promise<void>((resolve) => socket.once("close", () => resolve()));
  socket.write(`GET ${path} HTTP/1.1\r\nHost: zaki\r\nConnection: keep-alive\r\n\r\n`);
  await sleep(50); // the request is in its handler
  const received = () => {
    const all = Buffer.concat(chunks).toString("latin1");
    return { all, status: all.split("\r\n")[0], body: all.slice(all.indexOf("\r\n\r\n") + 4) };
  };
  return { app, socket, answer, gone, received };
}

describe("the app while it closes (the first step of the server's stop)", () => {
  it("waits for a reply that has ended but is still being written, and it arrives whole", async () => {
    const { app, socket, answer, gone, received } = await setUp("/big");
    socket.pause(); // a slow caller
    answer();
    await sleep(100); // the reply has ended; most of it waits in the server's buffers
    const closed = app.close();
    await sleep(200);
    socket.resume();
    await gone;
    await closed;
    const { all, status, body } = received();
    expect(status).toBe("HTTP/1.1 200 OK");
    expect(Number(/content-length: (\d+)/i.exec(all)?.[1])).toBe(BIG.length);
    expect(body.length).toBe(BIG.length);
  }, 20_000);

  it.each([
    ["a plain reply", "/big"],
    ["a reply written as it goes", "/stream"],
  ] as const)("finishes %s that is in flight when the close begins, then closes the connection the caller keeps", async (_name, path) => {
    const { app, socket, answer, gone, received } = await setUp(path);
    const closed = app.close();
    await sleep(100); // the close has begun: no new connections, the idle ones are gone
    socket.pause();
    answer();
    await sleep(200);
    socket.resume();
    await gone; // closed by the server: with keep-alive, the caller would have kept it
    await closed;
    const { all, status, body } = received();
    expect(status).toBe("HTTP/1.1 200 OK");
    // The caller is told the connection ends after this reply (a stream's headers went before the close).
    if (path === "/big") expect(all.slice(0, all.indexOf("\r\n\r\n"))).toMatch(/^connection: close$/im);
    if (path === "/big") expect(body.length).toBe(BIG.length);
    else expect(body.endsWith(`${JSON.stringify(BIG)}\n\n\r\n0\r\n\r\n`)).toBe(true); // the stream's last chunk arrived
  }, 20_000);

  it("answers every request a caller sent on its connection without waiting for the answers (pipelining), then closes it", async () => {
    const { app, gates, gone, received } = await setUpPipelined();
    const closed = app.close();
    await sleep(50);
    gates.a();
    await sleep(100);
    gates.b();
    await gone; // closed by the server, after the last answer
    await closed;
    const [a, b, ...more] = answers(received());
    expect([a?.status, a?.body, b?.status, b?.body]).toEqual(["HTTP/1.1 200 OK", '{"a":1}', "HTTP/1.1 200 OK", '{"b":2}']);
    expect(more).toEqual([]);
    expect(a?.head).toMatch(/^connection: keep-alive$/im); // the caller had already sent its next request on it
    expect(b?.head).toMatch(/^connection: close$/im);
  }, 20_000);

  it("does not wait for an answer whose turn on the connection never came because the caller went away", async () => {
    const { app, socket, gates } = await setUpPipelined();
    gates.b(); // the second answer is ready, and waits for the first to be sent
    await sleep(50);
    socket.destroy();
    await sleep(50);
    gates.a();
    await sleep(50);
    const started = Date.now();
    await app.close();
    expect(Date.now() - started).toBeLessThan(1_000); // not CLOSE_WAIT_MS for an answer that can never be written
  }, 20_000);
});

/** Two routes that answer when told, asked one after the other on one kept connection without waiting (pipelining). */
async function setUpPipelined() {
  const app = buildApp({ logger: false }, { rateLimitPerMinute: false });
  const gates = { a: () => {}, b: () => {} };
  const held = { a: new Promise<void>((resolve) => (gates.a = resolve)), b: new Promise<void>((resolve) => (gates.b = resolve)) };
  app.get("/a", async () => {
    await held.a;
    return { a: 1 };
  });
  app.get("/b", async () => {
    await held.b;
    return { b: 2 };
  });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const socket = connect((app.server.address() as AddressInfo).port, "127.0.0.1");
  const chunks: Buffer[] = [];
  socket.on("data", (chunk: Buffer) => chunks.push(chunk));
  socket.on("error", () => {});
  const gone = new Promise<void>((resolve) => socket.once("close", () => resolve()));
  socket.write("GET /a HTTP/1.1\r\nHost: zaki\r\nConnection: keep-alive\r\n\r\nGET /b HTTP/1.1\r\nHost: zaki\r\nConnection: keep-alive\r\n\r\n");
  await sleep(50); // both requests are in their handlers
  return { app, socket, gates, gone, received: () => Buffer.concat(chunks).toString("latin1") };
}

/** The answers one after the other in what a connection received (each with a content-length). */
function answers(all: string) {
  const out: { status: string; head: string; body: string }[] = [];
  for (let at = 0; at < all.length; ) {
    const end = all.indexOf("\r\n\r\n", at);
    if (end < 0) break;
    const head = all.slice(at, end);
    const length = Number(/^content-length: (\d+)$/im.exec(head)?.[1] ?? 0);
    out.push({ status: head.split("\r\n")[0]!, head, body: all.slice(end + 4, end + 4 + length) });
    at = end + 4 + length;
  }
  return out;
}
