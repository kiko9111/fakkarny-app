/**
 * One run at a time. A call made while a run is on its way gets one more run after it, because
 * that run may have read before whatever the caller just changed (a task accepted, a step turned
 * into a reminder). Every call in that window shares the one extra run. Pure.
 */
export function oneAtATime(run: () => Promise<void>): () => Promise<void> {
  let current: Promise<void> | null = null;
  let next: Promise<void> | null = null;
  const go = (): Promise<void> => {
    if (!current) {
      current = (async () => {
        try {
          await run();
        } finally {
          current = null;
        }
      })();
      return current;
    }
    const after = () => {
      next = null;
      return go();
    };
    next ??= current.then(after, after);
    return next;
  };
  return go;
}
