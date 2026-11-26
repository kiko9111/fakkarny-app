import { describe, expect, it } from "vitest";
import { entryActions, formatMoney, guessEntry, parseAmount } from "./logic";

describe("daftar logic", () => {
  const e = (status: "pending" | "confirmed" | "disputed" | "settled" | "cancelled", mine: boolean, direction: "owed_to_me" | "i_owe" = "owed_to_me", pay_link: string | null = null) => ({ status, mine, direction, pay_link });
  it("shows a tap's result at once, with the actions that follow from it", () => {
    const asked = e("pending", false, "i_owe");
    const yes = guessEntry(asked, "confirm")!;
    expect(yes.status).toBe("confirmed");
    expect(entryActions(yes)).toEqual(["settle"]);
    expect(guessEntry(asked, "dispute")!.status).toBe("disputed");
    expect(entryActions(guessEntry(yes, "settle")!)).toEqual([]);
    expect(guessEntry(e("pending", true), "cancel")!.status).toBe("cancelled");
    // These need the server first (the WhatsApp text, the InstaPay page).
    for (const a of ["resend", "nudge", "pay"] as const) expect(guessEntry(yes, a)).toBeNull();
    expect(asked.status).toBe("pending");
  });
  it("offers the right actions to each side", () => {
    expect(entryActions(e("pending", true))).toEqual(["resend", "cancel"]);
    expect(entryActions(e("pending", false, "i_owe"))).toEqual(["confirm", "dispute"]);
    expect(entryActions(e("confirmed", true, "owed_to_me"))).toEqual(["nudge", "settle"]);
    expect(entryActions(e("confirmed", true, "i_owe", "https://ipn.eg/S/a/instapay/b"))).toEqual(["pay", "settle"]);
    expect(entryActions(e("confirmed", false, "i_owe", "https://ipn.eg/S/a/instapay/b"))).toEqual(["pay", "settle"]);
    expect(entryActions(e("confirmed", false, "owed_to_me"))).toEqual(["settle"]);
    expect(entryActions(e("disputed", true))).toEqual(["cancel"]);
    expect(entryActions(e("disputed", false))).toEqual([]);
    expect(entryActions(e("settled", true))).toEqual([]);
  });
  it("reads amounts typed with Arabic or Western digits", () => {
    expect(parseAmount("200")).toBe(200);
    expect(parseAmount(" 1,200.50 ")).toBe(1200.5);
    expect(parseAmount("٢٠٠")).toBe(200);
    expect(parseAmount("١٬٢٠٠٫٥")).toBe(1200.5);
    expect(parseAmount("0")).toBeNull();
    expect(parseAmount("-5")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("1.234")).toBeNull();
    expect(formatMoney(1200.5)).toBe("1,200.5");
  });
});
