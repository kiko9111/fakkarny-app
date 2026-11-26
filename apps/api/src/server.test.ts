import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { type AddressInfo, createServer } from "node:net";
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
    // The container's own command line, without the migration step.
    child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
      cwd: API_DIR,
      env: {
        PATH: process.env["PATH"],
        PORT: String(port),
        HOST: "127.0.0.1",
        NODE_ENV: "test",
        DISABLE_JOBS: "1", // no scheduler: its cron would act on the test database
        ...(hasTestDb ? { DATABASE_URL: TEST_DATABASE_URL } : {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout?.on("data", (chunk: Buffer) => (out += chunk.toString("utf8")));
    child.stderr?.on("data", (chunk: Buffer) => (err += chunk.toString("utf8")));
    const ended = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => child?.once("exit", (code, signal) => resolve({ code, signal })));

    const base = `http://127.0.0.1:${port}`;
    const listening = (async () => {
      while (!out.includes("Server listening")) await new Promise((r) => setTimeout(r, 25));
      return "up" as const;
    })();
    expect(await Promise.race([listening, ended.then(() => `ended before it listened: ${err || out}`)])).toBe("up");

    const health = (await (await fetch(`${base}/health`)).json()) as { status: string; pid: number };
    expect(health.status).toBe("ok");
    expect(health.pid).toBe(child.pid); // no process in between: a signal sent to the command reaches the server

    if (hasTestDb) {
      // One lookup, so the pool holds a real connection when the signal comes (nothing is written).
      expect((await fetch(`${base}/i/${randomUUID()}`)).status).toBe(404);
    }

    child.kill("SIGTERM");
    child.kill("SIGTERM"); // a second signal changes nothing
    expect(await ended).toEqual({ code: 0, signal: null });
    expect(out.match(/"msg":"shutting down"/g)).toHaveLength(1);
    expect(out).not.toContain("shutdown failed");
  }, 60_000);
});
