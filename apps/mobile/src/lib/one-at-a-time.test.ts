import { describe, expect, it } from "vitest";
import { oneAtATime } from "./one-at-a-time";

function deferred() {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("oneAtATime", () => {
  it("runs once for a single call", async () => {
    let runs = 0;
    const go = oneAtATime(async () => {
      runs++;
    });
    await go();
    expect(runs).toBe(1);
  });

  it("gives calls made during a run one more run after it, shared by all of them", async () => {
    const gates = [deferred(), deferred()];
    let runs = 0;
    const go = oneAtATime(() => gates[runs++]!.promise);
    const first = go();
    const second = go();
    const third = go();
    expect(second).toBe(third);
    expect(runs).toBe(1);
    gates[0]!.resolve();
    await first;
    // The extra run starts only after the first one ended (it must read after the caller's change).
    await Promise.resolve();
    expect(runs).toBe(2);
    let secondDone = false;
    void second.then(() => (secondDone = true));
    await Promise.resolve();
    expect(secondDone).toBe(false);
    gates[1]!.resolve();
    await second;
    expect(secondDone).toBe(true);
    expect(runs).toBe(2);
  });

  it("starts fresh after everything settled", async () => {
    let runs = 0;
    const go = oneAtATime(async () => {
      runs++;
    });
    await go();
    await go();
    expect(runs).toBe(2);
  });

  it("still runs the extra run when the first one failed", async () => {
    const gate = deferred();
    let runs = 0;
    const go = oneAtATime(() => (runs++ === 0 ? gate.promise : Promise.resolve()));
    const first = go().catch((e: Error) => e.message);
    const second = go();
    gate.reject(new Error("offline"));
    expect(await first).toBe("offline");
    await second;
    expect(runs).toBe(2);
  });
});
