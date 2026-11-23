import { describe, expect, it, vi } from "vitest";
import type { PostMessageRequest, PostMessageResponse } from "@fakkarni/shared";
import { backoffMs, createSyncQueue, HttpError, type OutboxMessage, type OutboxStore, type Timers } from "./queue";

function memoryStore(initial: string[]) {
  const rows = new Map<string, OutboxMessage & { status: "pending" | "synced" | "failed" }>();
  initial.forEach((id, i) =>
    rows.set(id, { client_id: id, text: `msg ${id}`, created_at: new Date(2026, 10, 19, 9, i).toISOString(), attempts: 0, status: "pending" }),
  );
  const store: OutboxStore = {
    pending: async () => [...rows.values()].filter((r) => r.status === "pending").map(({ status: _s, ...m }) => m),
    markSynced: async (id) => void (rows.get(id)!.status = "synced"),
    markAttempt: async (id) => void rows.get(id)!.attempts++,
    markFailed: async (id) => void (rows.get(id)!.status = "failed"),
  };
  return { store, rows };
}

const ok = (msg: PostMessageRequest): PostMessageResponse => ({
  message: { id: `s-${msg.client_id}`, user_id: "u", role: "user", text: msg.text, client_id: msg.client_id, kind: "chat", created_at: msg.created_at, actions: [] },
  replies: [],
  items: [],
  memories: [],
  duplicate: false,
});

function fakeTimers() {
  const scheduled: { fn: () => void; ms: number }[] = [];
  const timers: Timers = {
    setTimeout: (fn, ms) => {
      const entry = { fn, ms };
      scheduled.push(entry);
      return entry;
    },
    clearTimeout: (h) => {
      const i = scheduled.indexOf(h as (typeof scheduled)[number]);
      if (i >= 0) scheduled.splice(i, 1);
    },
  };
  return { timers, scheduled };
}

describe("sync queue", () => {
  it("sends pending messages oldest first and marks them synced", async () => {
    const { store, rows } = memoryStore(["a", "b", "c"]);
    const sent: string[] = [];
    const q = createSyncQueue({ store, send: async (m) => (sent.push(m.client_id), ok(m)), timers: fakeTimers().timers });
    expect(await q.flush()).toBe("done");
    expect(sent).toEqual(["a", "b", "c"]);
    expect([...rows.values()].every((r) => r.status === "synced")).toBe(true);
  });

  it("does not send the attempts counter to the server", async () => {
    const { store } = memoryStore(["a"]);
    const send = vi.fn(async (m: PostMessageRequest) => ok(m));
    await createSyncQueue({ store, send, timers: fakeTimers().timers }).flush();
    expect(send.mock.calls[0]![0]).not.toHaveProperty("attempts");
  });

  it("stops at the first network error, keeps order, and schedules a retry", async () => {
    const { store, rows } = memoryStore(["a", "b"]);
    const { timers, scheduled } = fakeTimers();
    const send = vi.fn(async (m: PostMessageRequest) => {
      if (m.client_id === "a") throw new TypeError("Network request failed");
      return ok(m);
    });
    expect(await createSyncQueue({ store, send, timers }).flush()).toBe("offline");
    expect(send).toHaveBeenCalledTimes(1); // "b" waits behind "a"
    expect(rows.get("a")).toMatchObject({ status: "pending", attempts: 1 });
    expect(rows.get("b")!.status).toBe("pending");
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]!.ms).toBe(backoffMs(1));
  });

  it("delivers everything once the network is back (offline → online)", async () => {
    const { store, rows } = memoryStore(["a", "b"]);
    const { timers } = fakeTimers();
    let online = false;
    const q = createSyncQueue({
      store,
      send: async (m) => {
        if (!online) throw new TypeError("Network request failed");
        return ok(m);
      },
      timers,
    });
    expect(await q.flush()).toBe("offline");
    online = true;
    expect(await q.wake()).toBe("done");
    expect([...rows.values()].map((r) => r.status)).toEqual(["synced", "synced"]);
  });

  it("retries on 5xx, 409 and 429 but drops messages the server rejects (400)", async () => {
    for (const status of [500, 503, 409, 429]) {
      const { store, rows } = memoryStore(["a"]);
      const q = createSyncQueue({ store, send: async () => { throw new HttpError(status); }, timers: fakeTimers().timers });
      expect(await q.flush()).toBe("retrying");
      expect(rows.get("a")!.status).toBe("pending");
    }
    const { store, rows } = memoryStore(["bad", "good"]);
    const q = createSyncQueue({
      store,
      send: async (m) => {
        if (m.client_id === "bad") throw new HttpError(400);
        return ok(m);
      },
      timers: fakeTimers().timers,
    });
    expect(await q.flush()).toBe("done");
    expect(rows.get("bad")!.status).toBe("failed");
    expect(rows.get("good")!.status).toBe("synced");
  });

  it("keeps messages queued when chat is locked (402) and reports it", async () => {
    const { store, rows } = memoryStore(["a", "b"]);
    const { timers, scheduled } = fakeTimers();
    const locked: boolean[] = [];
    let subscribed = false;
    const q = createSyncQueue({
      store,
      send: async (m) => {
        if (!subscribed) throw new HttpError(402);
        return ok(m);
      },
      timers,
      onLockedChange: (l) => locked.push(l),
    });
    expect(await q.flush()).toBe("locked");
    expect([...rows.values()].map((r) => [r.status, r.attempts])).toEqual([["pending", 0], ["pending", 0]]);
    expect(scheduled).toHaveLength(0); // no pointless retries
    subscribed = true;
    expect(await q.flush()).toBe("done");
    expect(locked).toEqual([true, false, false]);
  });

  it("shares one run between concurrent flushes and picks up messages added mid-run", async () => {
    const { store, rows } = memoryStore(["a"]);
    const sent: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const q = createSyncQueue({
      store,
      send: async (m) => {
        if (m.client_id === "a") await gate;
        sent.push(m.client_id);
        return ok(m);
      },
      timers: fakeTimers().timers,
    });
    const first = q.flush();
    await new Promise((r) => setTimeout(r, 0));
    rows.set("b", { client_id: "b", text: "late", created_at: new Date().toISOString(), attempts: 0, status: "pending" });
    const second = q.flush();
    release();
    await Promise.all([first, second]);
    expect(sent).toEqual(["a", "b"]);
  });

  it("reports busy state for the typing indicator", async () => {
    const { store } = memoryStore(["a"]);
    const busy: boolean[] = [];
    await createSyncQueue({ store, send: async (m) => ok(m), timers: fakeTimers().timers, onBusyChange: (b) => busy.push(b) }).flush();
    expect(busy).toEqual([true, false]);
  });

  it("backs off exponentially up to 5 minutes", () => {
    expect(backoffMs(1)).toBe(2_000);
    expect(backoffMs(2)).toBe(4_000);
    expect(backoffMs(20)).toBe(300_000);
  });
});
