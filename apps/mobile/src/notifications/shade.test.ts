import { describe, expect, it } from "vitest";
import { shownItemId, staleShown, type Shown } from "./shade";

const T = Date.parse("2026-11-26T10:00:00Z");
const shown = (identifier: string, minutes: number): Shown => ({ identifier, date: T + minutes * 60_000 });
const statuses = (m: Record<string, string>) => (id: string) => m[id];

describe("shownItemId", () => {
  it("reads the item of a reminder, and nothing else", () => {
    expect(shownItemId("item_6f1c-22_hint")).toBe("6f1c-22");
    expect(shownItemId("item_a_clear")).toBe("a");
    expect(shownItemId("item_a_snooze")).toBe("a");
    expect(shownItemId("item_a_r29421440")).toBe("a");
    expect(shownItemId("item_a_followup")).toBeNull();
    expect(shownItemId("0b9c7e1e-push")).toBeNull();
  });
});

describe("staleShown", () => {
  it("keeps only the newest of an hourly reminder's occurrences", () => {
    const list = [shown("item_w_r100", 0), shown("item_w_r160", 60), shown("item_w_r220", 120)];
    expect(staleShown(list, statuses({ w: "open" })).sort()).toEqual(["item_w_r100", "item_w_r160"]);
    // Whatever order the phone lists them in.
    expect(staleShown([...list].reverse(), statuses({ w: "open" })).sort()).toEqual(["item_w_r100", "item_w_r160"]);
  });

  it("clears every reminder of a plan that is closed, and keeps one of an open plan", () => {
    const list = [shown("item_a_hint", 0), shown("item_a_clear", 30), shown("item_b_hint", 10), shown("item_c_clear", 5)];
    expect(staleShown(list, statuses({ a: "done", b: "open", c: "cancelled" })).sort()).toEqual(["item_a_clear", "item_a_hint", "item_c_clear"]);
    expect(staleShown([shown("item_b_hint", 0), shown("item_b_clear", 30)], statuses({ b: "open" }))).toEqual(["item_b_hint"]);
  });

  it("leaves alone a plan the phone does not hold, follow-ups and Zaki's messages", () => {
    const list = [shown("item_x_hint", 0), shown("item_x_clear", 30), shown("item_a_followup", 0), shown("push-1", 0)];
    expect(staleShown(list, statuses({ a: "done" }))).toEqual([]);
  });
});
