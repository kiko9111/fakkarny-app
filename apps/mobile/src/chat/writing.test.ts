import { describe, expect, it } from "vitest";
import type { LocalMessage } from "@/db/messages";
import { addWriting, isWriting, replyId, replyStored, withWriting } from "./writing";

const row = (client_id: string, role: "user" | "friend", text: string, at: string): LocalMessage => ({
  client_id,
  role,
  kind: "chat",
  text,
  created_at: at,
  sync_status: role === "user" ? "pending" : "synced",
  saved: null,
  server_id: null,
  actions: [],
});

const chat = [row("a", "user", "hi", "2026-11-25T10:00:00.000Z"), row("a:reply:0", "friend", "hello", "2026-11-25T10:00:01.000Z"), row("b", "user", "how are you", "2026-11-25T10:01:00.000Z")];

describe("addWriting", () => {
  it("grows a bubble and opens the next", () => {
    let w = addWriting(null, "b", 0, "I am");
    w = addWriting(w, "b", 0, " fine");
    w = addWriting(w, "b", 1, "And you?");
    expect(w).toEqual({ clientId: "b", bubbles: ["I am fine", "And you?"] });
  });

  it("starts over for another message, and never changes the one it was given", () => {
    const first = addWriting(null, "a", 0, "old");
    const next = addWriting(first, "b", 0, "new");
    expect(next).toEqual({ clientId: "b", bubbles: ["new"] });
    expect(first).toEqual({ clientId: "a", bubbles: ["old"] });
  });

  it("fills a gap when a later bubble arrives first", () => {
    expect(addWriting(null, "b", 1, "x")).toEqual({ clientId: "b", bubbles: ["", "x"] });
  });
});

describe("withWriting", () => {
  it("puts the reply being written right under the message it answers, with the stored reply's ids", () => {
    const later = row("c", "user", "one more", "2026-11-25T10:02:00.000Z");
    const out = withWriting([...chat, later], { clientId: "b", bubbles: ["I am fine", "And you?"] });
    expect(out.map((m) => m.client_id)).toEqual(["a", "a:reply:0", "b", replyId("b", 0), replyId("b", 1), "c"]);
    expect(out[3]).toMatchObject({ role: "friend", text: "I am fine", sync_status: "synced", created_at: "2026-11-25T10:01:00.001Z" });
    expect(out[4]!.created_at).toBe("2026-11-25T10:01:00.002Z");
  });

  it("gives the same list back when there is nothing to add", () => {
    expect(withWriting(chat, null)).toBe(chat);
    expect(withWriting(chat, { clientId: "b", bubbles: [] })).toBe(chat);
    expect(withWriting(chat, { clientId: "b", bubbles: ["  "] })).toBe(chat);
    // Its message is not in the list (another account, or an old chat).
    expect(withWriting(chat, { clientId: "zzz", bubbles: ["text"] })).toBe(chat);
  });

  it("steps aside once the stored reply is in the list", () => {
    const done = [...chat, row("b:reply:0", "friend", "I am fine, you?", "2026-11-25T10:01:02.000Z")];
    expect(withWriting(done, { clientId: "b", bubbles: ["I am fi"] })).toBe(done);
  });

  it("skips a bubble that has no words yet", () => {
    const out = withWriting(chat, { clientId: "b", bubbles: ["", "second"] });
    expect(out.map((m) => m.client_id)).toEqual(["a", "a:reply:0", "b", "b:reply:1"]);
  });

  it("copes with a message that has no usable date", () => {
    const odd = [row("b", "user", "hi", "not a date")];
    expect(() => withWriting(odd, { clientId: "b", bubbles: ["ok"] })).not.toThrow();
  });
});

describe("isWriting", () => {
  it("is true only for the rows of the reply being written", () => {
    const w = { clientId: "b", bubbles: ["x"] };
    expect(isWriting({ client_id: "b:reply:0" }, w)).toBe(true);
    expect(isWriting({ client_id: "a:reply:0" }, w)).toBe(false);
    expect(isWriting({ client_id: "b" }, w)).toBe(false);
    expect(isWriting({ client_id: "b:reply:0" }, null)).toBe(false);
  });
});

describe("replyStored", () => {
  it("is true once a stored reply to that message is in the list", () => {
    const w = addWriting(null, "m1", 0, "أهلا");
    expect(replyStored([{ client_id: "m1" }], w)).toBe(false);
    expect(replyStored([{ client_id: "m1" }, { client_id: "m2:reply:0" }], w)).toBe(false);
    expect(replyStored([{ client_id: "m1" }, { client_id: replyId("m1", 0) }], w)).toBe(true);
    expect(replyStored([{ client_id: replyId("m1", 0) }], null)).toBe(false);
  });
});
