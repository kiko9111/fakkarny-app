import { gunzipSync } from "node:zlib";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerGzip, GZIP_MIN_CHARS } from "./gzip";
import { registerIdempotency } from "./idempotency";
import { INSTALL_ID_HEADER } from "@fakkarni/shared";

function build() {
  const app = Fastify();
  registerIdempotency(app);
  registerGzip(app);
  const big = { rows: Array.from({ length: 200 }, (_, i) => ({ id: i, title: `مهمة رقم ${i}`, done: i % 2 === 0 })) };
  let writes = 0;
  app.get("/big", async () => big);
  app.get("/small", async () => ({ ok: true }));
  app.get("/picture", async (_req, reply) => reply.type("image/png").send(Buffer.alloc(GZIP_MIN_CHARS * 2, 7)));
  app.get("/page", async (_req, reply) => reply.type("text/html; charset=utf-8").send(`<html>${"<p>مرحبا</p>".repeat(400)}</html>`));
  app.post("/write", async () => ({ n: ++writes, pad: "x".repeat(GZIP_MIN_CHARS * 2) }));
  return { app, big };
}

describe("gzip", () => {
  it("packs big JSON for a caller that accepts gzip, and it unpacks to the same text", async () => {
    const { app, big } = build();
    const plain = await app.inject({ method: "GET", url: "/big" });
    const packed = await app.inject({ method: "GET", url: "/big", headers: { "accept-encoding": "gzip" } });
    expect(plain.headers["content-encoding"]).toBeUndefined();
    expect(packed.headers["content-encoding"]).toBe("gzip");
    expect(packed.headers.vary).toBe("accept-encoding");
    expect(Number(packed.headers["content-length"])).toBe(packed.rawPayload.length);
    expect(JSON.parse(gunzipSync(packed.rawPayload).toString("utf8"))).toEqual(big);
    expect(packed.rawPayload.length).toBeLessThan(plain.rawPayload.length / 3);
  });

  it("packs the public pages too", async () => {
    const { app } = build();
    const packed = await app.inject({ method: "GET", url: "/page", headers: { "accept-encoding": "br, gzip" } });
    expect(packed.headers["content-encoding"]).toBe("gzip");
    expect(gunzipSync(packed.rawPayload).toString("utf8")).toContain("مرحبا");
  });

  it("leaves small answers, pictures and callers that did not ask alone", async () => {
    const { app } = build();
    const small = await app.inject({ method: "GET", url: "/small", headers: { "accept-encoding": "gzip" } });
    expect(small.headers["content-encoding"]).toBeUndefined();
    expect(small.json()).toEqual({ ok: true });
    const picture = await app.inject({ method: "GET", url: "/picture", headers: { "accept-encoding": "gzip" } });
    expect(picture.headers["content-encoding"]).toBeUndefined();
    expect(picture.rawPayload.length).toBe(GZIP_MIN_CHARS * 2);
    const other = await app.inject({ method: "GET", url: "/big", headers: { "accept-encoding": "identity" } });
    expect(other.headers["content-encoding"]).toBeUndefined();
  });

  it("a replayed write is answered from the saved text, packed again for this caller", async () => {
    const { app } = build();
    const headers = { [INSTALL_ID_HEADER]: "phone-1", "x-idempotency-key": "tap-12345678", "accept-encoding": "gzip" };
    const first = await app.inject({ method: "POST", url: "/write", headers });
    const again = await app.inject({ method: "POST", url: "/write", headers });
    const read = (r: typeof first) => JSON.parse(gunzipSync(r.rawPayload).toString("utf8")) as { n: number };
    expect(first.headers["content-encoding"]).toBe("gzip");
    expect(again.headers["content-encoding"]).toBe("gzip");
    expect(again.headers["x-idempotent-replay"]).toBe("1");
    expect(read(first).n).toBe(1);
    expect(read(again).n).toBe(1);
  });
});
