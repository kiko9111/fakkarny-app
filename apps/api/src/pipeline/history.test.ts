import { describe, expect, it } from "vitest";
import { aiErrorProps, historyUpTo } from "./conversation";

const at = (s: number) => new Date(Date.UTC(2026, 10, 25, 13, 0, s));

describe("historyUpTo", () => {
  it("ends with the message being answered, leaving out what came after it", () => {
    const msg = { id: "m2", role: "user" as const, text: "fee eh kol dah", createdAt: at(10) };
    const recent = [
      { id: "m1", role: "friend" as const, text: "أهلاً", createdAt: at(5) },
      msg,
      { id: "m3", role: "friend" as const, text: "العصر دخل، صلّيت؟", createdAt: at(20) },
    ];
    expect(historyUpTo(recent, msg)).toEqual([
      { role: "assistant", text: "أهلاً" },
      { role: "user" as const, text: "fee eh kol dah" },
    ]);
  });

  it("adds the message when it fell out of the recent window", () => {
    const msg = { id: "old", role: "user" as const, text: "alo", createdAt: at(1) };
    expect(historyUpTo([{ id: "x", role: "friend" as const, text: "later", createdAt: at(9) }], msg)).toEqual([{ role: "user" as const, text: "alo" }]);
  });
});

describe("aiErrorProps", () => {
  it("names the cause without any text", () => {
    expect(aiErrorProps({ status: 400, message: "This model does not support assistant message prefill." })).toEqual({ status: 400, kind: "prefill" });
    expect(aiErrorProps({ status: 400, message: "Your credit balance is too low" }).kind).toBe("credit");
    expect(aiErrorProps({ status: 429, message: "x" }).kind).toBe("rate_limit");
  });
});
