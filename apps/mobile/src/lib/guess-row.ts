/**
 * What a card shows between a tap and the server's answer (the logic behind `useGuess`,
 * lib/optimistic.ts). Pure: the card's state setters are injected.
 *
 * - A tap shows its guess in the same frame and sends behind.
 * - Taps that add up (a tracker's +1, a reaction) may follow each other without waiting: each
 *   builds on what is shown (`next`), the sends go out one after another in the order tapped, and
 *   only when the last one is back does the server's word replace the guess, so an earlier answer
 *   never flashes a number the next tap already passed.
 * - A failure puts back the newest thing the server did confirm, or the list's own copy.
 * - A new copy from the list ends the guess, except while a send is still out (a reload that
 *   left before the tap would flash the old state back).
 */
export interface GuessHow<T, A> {
  /** What to show at once. */
  guess?: T | null;
  /** The same, built on what is shown right now (for taps that add up). */
  next?: (shown: T) => T | null;
  /** The server's answer as the thing itself, when it carries it. */
  adopt?: (answer: A) => T | null;
  /** A failure that still counts (kept on the phone and sent later): the guess stays. */
  keep?: (err: unknown) => boolean;
}

export function createGuessRow<T>(deps: {
  /** The list's own copy, as it is now. */
  value: () => T;
  /** Draw this instead of the list's copy (null: draw the list's copy). */
  show: (guess: T | null) => void;
  /** How many sends are out. */
  flying: (count: number) => void;
}) {
  let count = 0;
  let chain: Promise<unknown> = Promise.resolve();
  let guess: T | null = null;
  /** The newest state the server confirmed among the sends still in a row. */
  let truth: T | null = null;

  const show = (next: T | null) => {
    if (next === guess) return;
    guess = next;
    deps.show(next);
  };

  return {
    listChanged() {
      if (count === 0) show(null);
    },

    /** Show the guess now, send after the sends already out. Resolves or rejects as `send` does. */
    run<A>(send: () => Promise<A>, how: GuessHow<T, A> = {}): Promise<A> {
      let guessed: T | null;
      try {
        guessed = how.next ? how.next(guess ?? deps.value()) : (how.guess ?? null);
      } catch (err) {
        // Nothing was shown or counted yet: the tap simply fails.
        return Promise.reject(err);
      }
      count++;
      deps.flying(count);
      if (guessed !== null) show(guessed);
      const mine = chain.then(send);
      chain = mine
        .then(
          (answer) => {
            truth = how.adopt?.(answer) ?? guessed ?? truth;
          },
          (err) => {
            if (guessed !== null && how.keep?.(err)) truth = guessed;
          },
        )
        // A helper that throws (adopt, keep) must not leave the row busy for ever, or stop the
        // sends lined up behind this one.
        .catch(() => {})
        .then(() => {
          count--;
          if (count === 0) {
            show(truth);
            truth = null;
          }
          deps.flying(count);
        });
      return mine;
    },
  };
}
