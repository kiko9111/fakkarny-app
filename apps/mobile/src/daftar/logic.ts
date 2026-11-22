import type { DaftarEntry } from "@fakkarni/shared";

/** Pure helpers for the shared Daftar screens (unit-tested; no react-native imports). */
export type DaftarAction = "confirm" | "dispute" | "resend" | "cancel" | "nudge" | "pay" | "settle";

/** What this person can do with an entry right now, most useful first. Mirrors the server's rules. */
export function entryActions(e: Pick<DaftarEntry, "status" | "mine" | "direction" | "pay_link">): DaftarAction[] {
  if (e.status === "pending") return e.mine ? ["resend", "cancel"] : ["confirm", "dispute"];
  if (e.status === "disputed") return e.mine ? ["cancel"] : [];
  if (e.status !== "confirmed") return [];
  const actions: DaftarAction[] = [];
  if (e.pay_link) actions.push("pay");
  // Zaki nudges the other person only after they confirmed.
  if (e.mine && e.direction === "owed_to_me") actions.push("nudge");
  actions.push("settle");
  return actions;
}

/** "200", "200.5", "٢٠٠", "1,200" → a positive number, or null. */
export function parseAmount(text: string): number | null {
  const western = text.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[٬,\s]/g, "").replace("٫", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(western)) return null;
  const n = Number(western);
  return n > 0 && n <= 100_000_000 ? n : null;
}

export const formatMoney = (amount: number) => amount.toLocaleString("en-US", { maximumFractionDigits: 2 });
