import { describe, expect, it } from "vitest";
import { cityAskStep } from "./city-ask";

const on = { city: false, server: true };

describe("asking for the city", () => {
  it("asks once, on the third message", () => {
    let count: string | null = null;
    const asks: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      const step = cityAskStep(count, on);
      count = step.next;
      asks.push(step.ask);
    }
    expect(asks).toEqual([false, false, true, false, false, false]);
    expect(count).toBe("done");
  });

  it("never asks when the city is known or the server can't keep it", () => {
    expect(cityAskStep("2", { city: true, server: true })).toEqual({ next: "2", ask: false });
    expect(cityAskStep("2", { city: false, server: false })).toEqual({ next: "2", ask: false });
  });
});
