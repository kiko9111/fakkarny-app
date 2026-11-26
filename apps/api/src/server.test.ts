import { type ChildProcess, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { type AddressInfo, connect, createServer, type Server } from "node:net";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { hasTestDb, TEST_DATABASE_URL } from "../test/db";

/**
 * How the container starts the server, and how the server stops.
 *
 * A deploy sends SIGTERM to the container's first process and to no other. Started through
 * `sh -c "… && npx tsx src/server.ts"`, that process was the shell, which does not pass the
 * signal on: the server never heard it, ran on (holding its database connections) and was
 * killed. Checked in a process namespace on 2026-11-26; these tests keep the two halves true.
 */
const API_DIR = fileURLToPath(new URL("..", import.meta.url));
const DOCKERFILE = fileURLToPath(new URL("../../../Dockerfile", import.meta.url));

/** A port nothing listens on right now. */
const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });

const until = async (check: () => boolean) => {
  while (!check()) await new Promise((r) => setTimeout(r, 25));
};

/** The server process with the container's command line (without the migration step). */
function startServer(env: Record<string, string>) {
  const child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
    cwd: API_DIR,
    env: { PATH: process.env["PATH"], HOST: "127.0.0.1", NODE_ENV: "test", DISABLE_JOBS: "1", ...env }, // no scheduler: its cron would act on the test database
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = { out: "", err: "" };
  child.stdout?.on("data", (chunk: Buffer) => (logs.out += chunk.toString("utf8")));
  child.stderr?.on("data", (chunk: Buffer) => (logs.err += chunk.toString("utf8")));
  const ended = new Promise<{ code: number | null; signal: NodeJS.Signals | null; at: number }>((resolve) =>
    child.once("exit", (code, signal) => resolve({ code, signal, at: Date.now() })),
  );
  const listening = Promise.race([
    until(() => logs.out.includes("Server listening")).then(() => "up" as const),
    ended.then(() => `ended before it listened: ${logs.err || logs.out}`),
  ]);
  return { child, logs, ended, listening };
}

/** pg's goodbye on a connection it closes itself (Terminate: "X" and its length, 4). */
const TERMINATE = Buffer.from([0x58, 0, 0, 0, 4]);

/**
 * A TCP proxy in front of the test database whose every answer arrives `delayMs` late, in the
 * order it was sent. For each connection through it, it notes whether the server ended it with
 * pg's goodbye, which happens only when the server closes its pool itself: a process that just
 * exits leaves its connections to be closed by the system, with no goodbye.
 */
async function slowProxy(target: URL, delayMs: number) {
  const sessions: { ended: boolean; saidGoodbye: boolean }[] = [];
  const proxy: Server = createServer((client) => {
    const session = { ended: false, saidGoodbye: false };
    sessions.push(session);
    const up = connect(Number(target.port || 5432), target.hostname);
    // One queue per connection, so the answers can never overtake each other.
    const queue: { at: number; chunk: Buffer }[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      timer = undefined;
      while (queue.length && queue[0]!.at <= Date.now()) {
        const { chunk } = queue.shift()!;
        if (client.writable) client.write(chunk);
      }
      if (queue.length) timer = setTimeout(flush, queue[0]!.at - Date.now());
    };
    up.on("data", (chunk: Buffer) => {
      queue.push({ at: Date.now() + delayMs, chunk });
      timer ??= setTimeout(flush, delayMs);
    });
    let tail = Buffer.alloc(0);
    client.on("data", (chunk: Buffer) => {
      tail = Buffer.concat([tail, chunk]).subarray(-TERMINATE.length);
      up.write(chunk);
    });
    client.on("end", () => (session.saidGoodbye = tail.equals(TERMINATE)));
    const end = () => {
      session.ended = true;
      client.destroy();
      up.destroy();
    };
    client.on("close", end);
    up.on("close", () => setTimeout(end, delayMs + 50));
    client.on("error", () => {});
    up.on("error", () => {});
  });
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const url = new URL(target.href);
  url.hostname = "127.0.0.1";
  url.port = String((proxy.address() as AddressInfo).port);
  return { url: url.href, sessions, close: () => proxy.close() };
}

describe("the server as the container starts it", () => {
  let child: ChildProcess | undefined;
  afterEach(() => {
    if (child && child.exitCode === null) child.kill("SIGKILL");
  });

  it("is the container's first process: `exec node`, with no shell or npx left in front of it", () => {
    const cmd = readFileSync(DOCKERFILE, "utf8")
      .split("\n")
      .filter((line) => line.startsWith("CMD"))
      .at(-1);
    expect(cmd).toBe('CMD ["sh", "-c", "npx prisma migrate deploy && exec node --import tsx src/server.ts"]');
  });

  // Windows has no SIGTERM to handle: a kill there ends the process at once.
  it.skipIf(process.platform === "win32")("starts that way, says which process it is, and on SIGTERM stops once and exits 0", async () => {
    const port = await freePort();
    const server = startServer({ PORT: String(port), ...(hasTestDb ? { DATABASE_URL: TEST_DATABASE_URL! } : {}) });
    child = server.child;
    expect(await server.listening).toBe("up");

    const base = `http://127.0.0.1:${port}`;
    const health = (await (await fetch(`${base}/health`)).json()) as { status: string; pid: number };
    expect(health.status).toBe("ok");
    expect(health.pid).toBe(child.pid); // no process in between: a signal sent to the command reaches the server

    if (hasTestDb) {
      // One lookup (an invite code of the right shape that does not exist), so the pool holds a
      // real connection when the signal comes. Nothing is written.
      expect((await fetch(`${base}/i/ZZZZZZZZ`)).status).toBe(404);
    }

    child.kill("SIGTERM");
    await until(() => server.logs.out.includes('"msg":"shutting down"'));
    child.kill("SIGTERM"); // a second signal, once the stop has begun, changes nothing
    expect(await server.ended).toMatchObject({ code: 0, signal: null });
    expect(server.logs.out.match(/"msg":"shutting down"/g)).toHaveLength(1);
    expect(server.logs.out).not.toContain("shutdown failed");
  }, 60_000);

  // A deploy's proxy keeps its connection to the server after an answer. Node's close() leaves a
  // connection that was busy at the signal open once its reply is sent, until the caller closes
  // it (Fastify's keep-alive timeout, 72 s): the server held its database connections that long
  // and was killed at the end of the drain.
  it.skipIf(process.platform === "win32" || !hasTestDb)(
    "finishes a reply that is in flight at SIGTERM, closes its database connections, then exits at once although the caller keeps its connection",
    async () => {
      const proxy = await slowProxy(new URL(TEST_DATABASE_URL!), 400);
      try {
        const port = await freePort();
        const server = startServer({ PORT: String(port), DATABASE_URL: proxy.url });
        child = server.child;
        expect(await server.listening).toBe("up");

        // One request on a connection the caller keeps, as a proxy's connection pool does.
        const socket = connect(port, "127.0.0.1");
        let answer = "";
        let answeredAt = 0;
        socket.on("data", (chunk: Buffer) => {
          answer += chunk.toString("utf8");
          if (!answeredAt && answer.includes("\r\n\r\n")) answeredAt = Date.now();
        });
        socket.on("error", () => {});
        socket.write("GET /i/ZZZZZZZZ HTTP/1.1\r\nHost: zaki\r\nConnection: keep-alive\r\n\r\n");
        await new Promise((r) => setTimeout(r, 300)); // the lookup is on its way through the slow proxy
        child.kill("SIGTERM");

        const ended = await server.ended;
        expect(answer.split("\r\n")[0]).toBe("HTTP/1.1 404 Not Found"); // the reply in flight was finished
        expect(ended).toMatchObject({ code: 0, signal: null });
        expect(ended.at - answeredAt).toBeLessThan(5_000); // not the 72 s of a kept connection
        expect(server.logs.out).not.toContain("shutdown failed");
        await until(() => socket.destroyed || socket.readableEnded);
        // The server closed its database connections itself before it exited.
        await until(() => proxy.sessions.every((session) => session.ended));
        expect(proxy.sessions.length).toBeGreaterThan(0);
        expect(proxy.sessions.map((session) => session.saidGoodbye)).toEqual(proxy.sessions.map(() => true));
        socket.destroy();
      } finally {
        proxy.close();
      }
    },
    60_000,
  );
});
