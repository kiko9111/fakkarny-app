import { describe, expect, it } from "vitest";
import { createGuessRow } from "./guess-row";

/** A promise settled by hand, to play the server's answers in any order. */
function later<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

function card(start: number) {
  const state = { list: start, guess: null as number | null, flying: 0, shows: [] as (number | null)[] };
  const row = createGuessRow<number>({
    value: () => state.list,
    show: (g) => {
      state.guess = g;
      state.shows.push(g);
    },
    flying: (n) => (state.flying = n),
  });
  const shown = () => state.guess ?? state.list;
  return { state, row, shown };
}

describe("a card's guess after a tap", () => {
  it("shows the guess at once and the server's answer when it is back", async () => {
    const { state, row, shown } = card(1);
    const answer = later<number>();
    const done = row.run(() => answer.promise, { guess: 2, adopt: (a) => a });
    expect(shown()).toBe(2);
    expect(state.flying).toBe(1);
    answer.resolve(20);
    await done;
    await settle();
    expect(shown()).toBe(20);
    expect(state.flying).toBe(0);
  });

  it("puts the list's copy back when the send fails, and passes the failure on", async () => {
    const { row, shown } = card(1);
    const answer = later<number>();
    const done = row.run(() => answer.promise, { guess: 2, adopt: (a) => a });
    answer.reject(new Error("no"));
    await expect(done).rejects.toThrow("no");
    await settle();
    expect(shown()).toBe(1);
  });

  it("keeps the guess for a tap saved on the phone to be sent later", async () => {
    const { row, shown } = card(1);
    const done = row.run(() => Promise.reject(new Error("queued")), { guess: 2, keep: (e) => (e as Error).message === "queued" });
    await expect(done).rejects.toThrow("queued");
    await settle();
    expect(shown()).toBe(2);
  });

  it("adds up taps that follow each other, sends them in order, and takes only the last answer", async () => {
    const { state, row, shown } = card(5);
    const sent: number[] = [];
    const answers = [later<number>(), later<number>(), later<number>()];
    const tap = (n: number) =>
      row.run(
        () => {
          sent.push(n);
          return answers[n]!.promise;
        },
        { next: (x) => x + 1, adopt: (a) => a },
      );
    void tap(0);
    void tap(1);
    void tap(2);
    // All three show before anything is answered, and only the first has left.
    expect(shown()).toBe(8);
    const drawn = state.shows.length;
    await settle();
    expect(sent).toEqual([0]);

    answers[0]!.resolve(6);
    await settle();
    expect(sent).toEqual([0, 1]);
    // The first answer (6) is behind what the user already tapped: it is not drawn.
    expect(shown()).toBe(8);
    answers[1]!.resolve(7);
    await settle();
    expect(shown()).toBe(8);
    answers[2]!.resolve(8);
    await settle();
    expect(shown()).toBe(8);
    expect(state.flying).toBe(0);
    // Nothing but the final number was drawn after the taps.
    expect(state.shows.slice(drawn)).toEqual([]);
  });

  it("after a failure in a row of taps, shows the newest thing the server confirmed", async () => {
    const { row, shown } = card(5);
    const a = later<number>();
    const b = later<number>();
    void row.run(() => a.promise, { next: (x) => x + 1, adopt: (v) => v });
    const second = row.run(() => b.promise, { next: (x) => x + 1, adopt: (v) => v });
    expect(shown()).toBe(7);
    a.resolve(6);
    b.reject(new Error("offline"));
    await expect(second).rejects.toThrow("offline");
    await settle();
    expect(shown()).toBe(6);
  });

  it("a send whose answer carries nothing keeps its guess as the confirmed state", async () => {
    const { row, shown } = card(3);
    await row.run(() => Promise.resolve(), { guess: 0 });
    await settle();
    expect(shown()).toBe(0);
  });

  it("drops the guess when the list hands over a new copy, but not while a send is out", async () => {
    const { state, row, shown } = card(1);
    const answer = later<number>();
    const done = row.run(() => answer.promise, { guess: 2, adopt: (a) => a });
    // A reload that left before the tap comes back with the old state: the guess stays.
    state.list = 1;
    row.listChanged();
    expect(shown()).toBe(2);
    answer.resolve(2);
    await done;
    await settle();
    // The reload after the answer brings the list's own new copy.
    state.list = 22;
    row.listChanged();
    expect(shown()).toBe(22);
    expect(state.guess).toBeNull();
  });

  it("a tap with nothing to show leaves the list's copy on screen while it waits", async () => {
    const { state, row, shown } = card(1);
    const answer = later<number>();
    const done = row.run(() => answer.promise, { adopt: (a) => a });
    expect(shown()).toBe(1);
    expect(state.guess).toBeNull();
    expect(state.flying).toBe(1);
    answer.resolve(9);
    await done;
    await settle();
    expect(shown()).toBe(9);
  });

  it("is not left busy when a helper throws, and the next tap still goes out", async () => {
    const { state, row, shown } = card(1);
    // `next` throws before anything is shown: the tap fails and nothing is counted.
    await expect(
      row.run(() => Promise.resolve(5), {
        next: () => {
          throw new Error("bad guess");
        },
      }),
    ).rejects.toThrow("bad guess");
    expect(state.flying).toBe(0);
    expect(shown()).toBe(1);
    // `adopt` throws after the server answered: the send itself succeeded.
    const done = row.run(() => Promise.resolve(5), {
      guess: 2,
      adopt: () => {
        throw new Error("bad answer");
      },
    });
    await expect(done).resolves.toBe(5);
    await settle();
    expect(state.flying).toBe(0);
    // The sends lined up behind it are not stuck.
    await expect(row.run(() => Promise.resolve(7), { guess: 3, adopt: (a) => a })).resolves.toBe(7);
    await settle();
    expect(shown()).toBe(7);
    expect(state.flying).toBe(0);
  });
});
