import { describe, expect, it } from "vitest";
import { readTaps, rememberTap, tapKey, TAPS_KEPT } from "./taps";

describe("answered taps", () => {
  it("tells taps apart by notification, when it was shown and the button", () => {
    const key = tapKey("item_a_hint", 1764150000000, "done");
    expect(key).not.toBe(tapKey("item_a_hint", 1764150000000, "later"));
    expect(key).not.toBe(tapKey("item_a_hint", 1764153600000, "done"));
    expect(key).not.toBe(tapKey("item_b_hint", 1764150000000, "done"));
  });

  it("remembers the newest taps only, each once", () => {
    let taps: string[] = [];
    for (let n = 0; n < TAPS_KEPT + 5; n++) taps = rememberTap(taps, `t${n}`);
    expect(taps).toHaveLength(TAPS_KEPT);
    expect(taps[0]).toBe("t5");
    expect(rememberTap(["a", "b"], "a")).toEqual(["b", "a"]);
  });

  it("reads what storage holds, and nothing from what it can't read", () => {
    expect(readTaps(JSON.stringify(["a", "b"]))).toEqual(["a", "b"]);
    expect(readTaps(null)).toEqual([]);
    expect(readTaps("{broken")).toEqual([]);
    expect(readTaps(JSON.stringify({ a: 1 }))).toEqual([]);
    expect(readTaps(JSON.stringify(["a", 2, null]))).toEqual(["a"]);
  });
});
