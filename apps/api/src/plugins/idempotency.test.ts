import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { registerIdempotency } from "./idempotency";

describe("idempotency keys", () => {
  it("answers a replayed write from memory instead of writing twice", async () => {
    const app = Fastify();
    registerIdempotency(app);
    let writes = 0;
    app.post("/x", async () => ({ n: ++writes }));
    const send = (key: string | null, id = "install-1") =>
      app.inject({ method: "POST", url: "/x", headers: { "x-install-id": id, ...(key ? { "x-idempotency-key": key } : {}) }, payload: {} });
    expect((await send("key-12345678")).json()).toEqual({ n: 1 });
    const again = await send("key-12345678");
    expect(again.json()).toEqual({ n: 1 });
    expect(again.headers["x-idempotent-replay"]).toBe("1");
    expect((await send("key-87654321")).json()).toEqual({ n: 2 });
    expect((await send("key-12345678", "install-2")).json()).toEqual({ n: 3 });
    expect((await send(null)).json()).toEqual({ n: 4 });
    expect((await send(null)).json()).toEqual({ n: 5 });
  });
});
