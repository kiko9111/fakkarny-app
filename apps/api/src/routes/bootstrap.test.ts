import { randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { INSTALL_ID_HEADER } from "@fakkarni/shared";
import { buildApp } from "../app";
import { hasTestDb, resetDb, testPrisma } from "../../test/db";
import { BOOTSTRAP_BASE, BOOTSTRAP_PER_MINUTE, INTERNAL_HEADER } from "./bootstrap";

type Parts = Record<string, string>;

/** GET /bootstrap answers every tab at once, each part being exactly what its own GET answers. */
describe.skipIf(!hasTestDb)("GET /bootstrap", () => {
  const prisma = testPrisma();
  const mona = randomUUID();
  const omar = randomUUID();
  const app = buildApp({ logger: false }, { prisma, rateLimitPerMinute: 40 });
  const call = (who: string, method: "GET" | "POST" | "PATCH", url: string, payload?: object, headers: Record<string, string> = {}) =>
    app.inject({ method, url, headers: { [INSTALL_ID_HEADER]: who, ...headers }, ...(payload ? { payload } : {}) });
  const parts = async (who: string): Promise<Parts> => (await call(who, "GET", "/bootstrap")).json().parts;

  beforeEach(() => resetDb(prisma));
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("returns each tab's own answer, word for word", async () => {
    await call(mona, "PATCH", "/me", { name: "Mona" });
    const circle = (await call(mona, "POST", "/circles", { kind: "family", name: "البيت" })).json().circle;
    await call(mona, "POST", "/trackers", { kind: "water" });
    await call(mona, "POST", "/daftar", { other_name: "Sara", amount: 250, direction: "owed_to_me" });

    const got = await parts(mona);
    const paths = [...BOOTSTRAP_BASE, `/circles/${circle.id}`, `/circles/${circle.id}/feed`, `/circles/${circle.id}/trackers`];
    expect(Object.keys(got).sort()).toEqual([...paths].sort());
    for (const path of paths) {
      const alone = await call(mona, "GET", path);
      expect(alone.statusCode).toBe(200);
      expect(got[path], path).toBe(alone.payload);
    }
    expect(JSON.parse(got["/me"]!).user.name).toBe("Mona");
    expect(JSON.parse(got["/circles"]!).circles).toHaveLength(1);
  });

  it("answers as the caller: someone else's circle never comes along", async () => {
    await call(mona, "POST", "/circles", { kind: "friends", name: "Mona's people" });
    const got = await parts(omar);
    expect(JSON.parse(got["/circles"]!).circles).toEqual([]);
    expect(Object.keys(got).filter((p) => p.startsWith("/circles/"))).toEqual([]);
  });

  it("says 304 when nothing changed, and sends the new answer when something did", async () => {
    const first = await call(mona, "GET", "/bootstrap");
    const etag = first.headers.etag as string;
    expect(etag).toMatch(/^".+"$/);

    const same = await call(mona, "GET", "/bootstrap", undefined, { "if-none-match": etag });
    expect(same.statusCode).toBe(304);
    expect(same.payload).toBe("");

    await call(mona, "POST", "/trackers", { kind: "water" });
    const changed = await call(mona, "GET", "/bootstrap", undefined, { "if-none-match": etag });
    expect(changed.statusCode).toBe(200);
    expect(changed.headers.etag).not.toBe(etag);
    expect(JSON.parse(changed.json().parts["/trackers"]).trackers).toHaveLength(1);
  });

  it("counts as one request against the rate limit, however many tabs it loads", async () => {
    await call(mona, "POST", "/circles", { kind: "family", name: "One" });
    await call(mona, "POST", "/circles", { kind: "friends", name: "Two" });
    // Each call runs 14 GETs inside; at 40 a minute, three calls would be refused if they counted.
    for (let i = 0; i < 3; i++) expect((await call(mona, "GET", "/bootstrap")).statusCode).toBe(200);
  });

  it("has its own limit per caller, since one call runs many requests inside", async () => {
    const nour = randomUUID();
    const codes: number[] = [];
    for (let i = 0; i < BOOTSTRAP_PER_MINUTE + 1; i++) codes.push((await call(nour, "GET", "/bootstrap")).statusCode);
    expect(codes.slice(0, BOOTSTRAP_PER_MINUTE).every((c) => c === 200)).toBe(true);
    expect(codes.at(-1)).toBe(429);
    // Someone else is not held back by it.
    expect((await call(randomUUID(), "GET", "/bootstrap")).statusCode).toBe(200);
  });

  it("does not take the inner-request mark from outside", async () => {
    // A caller sending the header themselves is rate-limited like anyone.
    let refused = 0;
    for (let i = 0; i < 45; i++) if ((await call(omar, "GET", "/me", undefined, { [INTERNAL_HEADER]: "guess" })).statusCode === 429) refused++;
    expect(refused).toBeGreaterThan(0);
  });

  it("still answers when the server begins to stop while it runs, without the parts that had not started", async () => {
    // Its own app: this one is closed in the middle of a call.
    const stopping = buildApp({ logger: false }, { prisma, rateLimitPerMinute: false });
    let closed: Promise<void> | undefined;
    stopping.addHook("onRequest", async (req) => {
      // The first inner request: the stop (SIGTERM, server.ts) begins while the rest wait their turn.
      if (req.url === "/circles" && !closed) closed = stopping.close();
    });
    const res = await stopping.inject({ method: "GET", url: "/bootstrap", headers: { [INSTALL_ID_HEADER]: mona } });
    await closed;
    expect(res.statusCode).toBe(200);
    const got = res.json().parts as Parts;
    expect(Object.keys(got)).toContain("/circles"); // under way at the signal: finished
    expect(Object.keys(got).length).toBeGreaterThan(0);
    expect(Object.keys(got).length).toBeLessThan(BOOTSTRAP_BASE.length);
    for (const json of Object.values(got)) expect(() => JSON.parse(json)).not.toThrow();
  });

  it("leaves gzipped when the caller accepts it", async () => {
    await call(mona, "POST", "/trackers", { kind: "water" });
    await call(mona, "POST", "/circles", { kind: "family", name: "البيت" });
    const plain = await call(mona, "GET", "/bootstrap");
    const packed = await call(mona, "GET", "/bootstrap", undefined, { "accept-encoding": "gzip, deflate" });
    expect(packed.headers["content-encoding"]).toBe("gzip");
    expect(gunzipSync(packed.rawPayload).toString("utf8")).toBe(plain.payload);
    expect(packed.rawPayload.length).toBeLessThan(plain.payload.length / 2);
  });
});
