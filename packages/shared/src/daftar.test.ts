import { describe, expect, it } from "vitest";
import { daftarTotals, parseInstapayLink } from "./daftar";

describe("daftar helpers", () => {
  it("accepts only InstaPay payment links", () => {
    expect(parseInstapayLink("https://ipn.eg/S/mona.ali/instapay/8DbD6Q")).toBe("https://ipn.eg/S/mona.ali/instapay/8DbD6Q");
    expect(parseInstapayLink("ابعتلي هنا https://ipn.eg/S/mona/instapay/abc شكرا")).toBe("https://ipn.eg/S/mona/instapay/abc");
    expect(parseInstapayLink("https://evil.example/ipn.eg/S/x")).toBeNull();
    expect(parseInstapayLink("https://ipn.eg.evil.com/S/x")).toBeNull();
    expect(parseInstapayLink("http://ipn.eg/S/x")).toBeNull();
    expect(parseInstapayLink("javascript:alert(1)")).toBeNull();
    expect(parseInstapayLink("mona@instapay")).toBeNull();
  });
  it("totals open entries by direction", () => {
    const e = (direction: "owed_to_me" | "i_owe", amount: number, status: "pending" | "confirmed" | "settled" | "disputed" | "cancelled") => ({ direction, amount, status });
    expect(daftarTotals([e("owed_to_me", 200, "confirmed"), e("owed_to_me", 50, "pending"), e("i_owe", 30, "confirmed"), e("i_owe", 999, "settled"), e("owed_to_me", 999, "disputed"), e("i_owe", 5, "cancelled")])).toEqual({ owedToMe: 250, iOwe: 30 });
  });
});
