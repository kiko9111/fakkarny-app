import { describe, expect, it } from "vitest";
import { HttpError } from "./queue";
import { createWriteOutbox, isOffline, MAX_AGE_MS, type PendingWrite } from "./writes";

const mem = () => {
  let v: PendingWrite[] = [];
  return { load: () => v, save: (w: PendingWrite[]) => void (v = w) };
};
const NOW = Date.parse("2026-11-25T10:00:00Z");
const w = (id: string, ago = 0): PendingWrite => ({ id, method: "POST", path: `/x/${id}`, at: new Date(NOW - ago).toISOString() });

describe("write outbox", () => {
  it("sends oldest first and clears what went through", async () => {
    const store = mem();
    const sent: string[] = [];
    const box = createWriteOutbox({ store, now: () => NOW, send: async (x) => void sent.push(x.id) });
    box.enqueue(w("a"));
    box.enqueue(w("b"));
    expect(await box.flush()).toBe("done");
    expect(sent).toEqual(["a", "b"]);
    expect(box.pending()).toEqual([]);
  });

  it("stops and keeps the order when offline or the server is busy", async () => {
    const store = mem();
    let fail: unknown = new TypeError("Network request failed");
    const sent: string[] = [];
    const box = createWriteOutbox({ store, now: () => NOW, send: async (x) => {
      if (fail) throw fail;
      sent.push(x.id);
    } });
    box.enqueue(w("a"));
    box.enqueue(w("b"));
    expect(await box.flush()).toBe("offline");
    expect(box.pending().map((x) => x.id)).toEqual(["a", "b"]);
    fail = new HttpError(503);
    expect(await box.flush()).toBe("offline");
    fail = null;
    await box.flush();
    expect(sent).toEqual(["a", "b"]);
  });

  it("drops writes the server refuses for good, and stale ones", async () => {
    const store = mem();
    const sent: string[] = [];
    const box = createWriteOutbox({ store, now: () => NOW, send: async (x) => {
      if (x.id === "gone") throw new HttpError(404);
      sent.push(x.id);
    } });
    box.enqueue(w("old", MAX_AGE_MS + 1));
    box.enqueue(w("gone"));
    box.enqueue(w("ok"));
    await box.flush();
    expect(sent).toEqual(["ok"]);
    expect(box.pending()).toEqual([]);
  });

  it("tells offline from a refusal", () => {
    expect(isOffline(new TypeError("x"))).toBe(true);
    expect(isOffline(new HttpError(0))).toBe(true);
    expect(isOffline(new HttpError(400))).toBe(false);
  });
});
