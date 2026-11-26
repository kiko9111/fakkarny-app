import { useCallback, useEffect, useRef, useState } from "react";
import { createGuessRow, type GuessHow } from "./guess-row";

/**
 * A card's own guess of what its thing looks like right after a tap (rules in guess-row.ts).
 *
 * The card draws `shown`. A tap hands over the guess (tasks/logic.ts `guessTask` and friends) and
 * the send: the guess is on screen in the same frame, the server's answer replaces it when it
 * comes back, and a failure puts the server's copy back. When the list reloads and hands the card
 * a new `value`, the guess has done its job and is dropped.
 *
 * `busy` is true while a send is out; `waiting` when that tap had nothing to show yet (no
 * guess): the card may dim then.
 */
export function useGuess<T>(value: T) {
  const [guess, setGuess] = useState<T | null>(null);
  const [flying, setFlying] = useState(0);
  const current = useRef(value);
  current.current = value;
  const alive = useRef(true);
  const row = useRef<ReturnType<typeof createGuessRow<T>> | null>(null);
  row.current ??= createGuessRow<T>({
    value: () => current.current,
    show: (g) => {
      if (alive.current) setGuess(g);
    },
    flying: (n) => {
      if (alive.current) setFlying(n);
    },
  });

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => row.current?.listChanged(), [value]);

  const run = useCallback(<A>(send: () => Promise<A>, how?: GuessHow<T, A>): Promise<A> => row.current!.run(send, how), []);

  return { shown: guess ?? value, busy: flying > 0, waiting: flying > 0 && guess === null, run };
}
