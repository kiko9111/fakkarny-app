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
    const { status, body } = received();
    expect(status).toBe("HTTP/1.1 200 OK");
    if (path === "/big") expect(body.length).toBe(BIG.length);
    else expect(body.endsWith(`${JSON.stringify(BIG)}\n\n\r\n0\r\n\r\n`)).toBe(true); // the stream's last chunk arrived
  }, 20_000);
});
