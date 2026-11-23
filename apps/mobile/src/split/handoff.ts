import type { Draft } from "./logic";

/**
 * A filled split form waiting for the split screen (from a receipt photo). Kept in memory only:
 * a draft is never written to disk, and it is taken once.
 */
let pending: Draft | null = null;

export function handOffDraft(d: Draft): void {
  pending = d;
}

export function takeDraft(): Draft | null {
  const d = pending;
  pending = null;
  return d;
}
