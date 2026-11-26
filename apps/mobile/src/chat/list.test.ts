import { describe, expect, it } from "vitest";
import type { LocalMessage } from "@/db/messages";
import { draftTime, keepSame, withDrafts } from "./list";

const msg = (id: string, over: Partial<LocalMessage> = {}): LocalMessage => ({
  client_id: id,
  role: "user",
  kind: "chat",
  text: `text ${id}`,
  created_at: "2026-11-25T10:00:00.000Z",
  sync_status: "synced",
  saved: null,
  server_id: null,
  actions: [],
  ...over,
});

describe("keepSame", () => {
  it("hands back the very same list when nothing changed", () => {
    const prev = [msg("a"), msg("b")];
    expect(keepSame(prev, [msg("a"), msg("b")])).toBe(prev);
  });

  it("keeps the objects of messages that did not change and takes the new ones", () => {
    const prev = [msg("a"), msg("b", { sync_status: "pending" })];
    const next = keepSame(prev, [msg("a"), msg("b"), msg("c", { role: "friend" })]);
    expect(next).not.toBe(prev);
    expect(next[0]).toBe(prev[0]);
    expect(next[1]).not.toBe(prev[1]);
    expect(next[1]!.sync_status).toBe("synced");
    expect(next).toHaveLength(3);
  });

  it("sees a card that was answered and a saved chip that changed", () => {
    const card = { id: "c1", kind: "log_money", status: "pending", label: "x" } as LocalMessage["actions"][number];
    const prev = [msg("a", { actions: [card] }), msg("b", { saved: { items: [], memories: [] } as unknown as LocalMessage["saved"] })];
    expect(keepSame(prev, [msg("a", { actions: [{ ...card }] }), msg("b", { saved: { items: [], memories: [] } as unknown as LocalMessage["saved"] })])).toBe(prev);
    const next = keepSame(prev, [msg("a", { actions: [{ ...card, status: "done" }] }), prev[1]!]);
    expect(next[0]!.actions[0]!.status).toBe("done");
    expect(next[1]).toBe(prev[1]);
  });

  it("notices a new order (the server's time moved a message)", () => {
    const prev = [msg("a"), msg("b")];
    const next = keepSame(prev, [msg("b"), msg("a")]);
    expect(next).not.toBe(prev);
    expect(next.map((m) => m.client_id)).toEqual(["b", "a"]);
    expect(next[0]).toBe(prev[1]);
  });
});

describe("withDrafts", () => {
  it("keeps a message typed a moment ago on screen until the store holds it", () => {
    const rows = [msg("a")];
    const draft = msg("new", { sync_status: "pending" });
    expect(withDrafts(rows, [])).toBe(rows);
    expect(withDrafts(rows, [draft]).map((m) => m.client_id)).toEqual(["a", "new"]);
    const stored = [msg("a"), msg("new", { sync_status: "pending" })];
    expect(withDrafts(stored, [draft])).toBe(stored);
  });
});

describe("draftTime", () => {
  const now = Date.parse("2026-11-25T10:00:00.000Z");
  it("is the phone's time", () => {
    expect(draftTime(now, undefined)).toBe("2026-11-25T10:00:00.000Z");
    expect(draftTime(now, "2026-11-25T09:59:00.000Z")).toBe("2026-11-25T10:00:00.000Z");
  });
  it("is never before the newest message on screen", () => {
    expect(draftTime(now, "2026-11-25T10:00:05.000Z")).toBe("2026-11-25T10:00:05.001Z");
    expect(draftTime(now, "not a date")).toBe("2026-11-25T10:00:00.000Z");
  });
});
