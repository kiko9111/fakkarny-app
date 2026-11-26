/**
 * Which bubbles rise into place (pure): the ones that arrive while the chat is open, once each.
 * The messages already there when the chat opens are simply there, and a bubble that scrolls
 * out of the list's window and back in does not arrive a second time.
 */
export interface Entrance {
  /** The chat's first full list: nothing in it arrives. Later calls change nothing. */
  open(ids: Iterable<string>): void;
  /** True when this message has not been on screen before (and the chat has opened). */
  fresh(id: string): boolean;
  /** The bubble for `id` is on screen. */
  shown(id: string): void;
}

export function createEntrance(): Entrance {
  let opened = false;
  const seen = new Set<string>();
  return {
    open(ids) {
      if (opened) return;
      opened = true;
      for (const id of ids) seen.add(id);
    },
    fresh: (id) => opened && !seen.has(id),
    shown(id) {
      seen.add(id);
    },
  };
}
