/**
 * Which bubbles rise into place (pure): the ones that arrive at the foot of the chat while it
 * is open, once each. The messages already there when the chat opens are simply there. So is
 * a history that lands in one piece (signing in on a new phone pulls every message): only its
 * newest few arrive, and the older ones do not rise one by one as they are scrolled to.
 */
export interface Entrance {
  /**
   * The list as it stands now, newest first. Call it before the list is drawn. Nothing in the
   * first list arrives; after that, what is new among the newest few does.
   */
  list(ids: readonly string[]): void;
  /** True while this message is arriving and its bubble has not been drawn yet. */
  fresh(id: string): boolean;
  /** The bubble for `id` is on screen: it has arrived. */
  shown(id: string): void;
}

/** A reply is at most three bubbles, and a line of Zaki's own may follow it. */
export const ARRIVING = 4;

export function createEntrance(newest = ARRIVING): Entrance {
  let opened = false;
  const known = new Set<string>();
  const arriving = new Set<string>();
  return {
    list(ids) {
      if (opened) for (const id of ids.slice(0, newest)) if (!known.has(id)) arriving.add(id);
      for (const id of ids) known.add(id);
      opened = true;
    },
    fresh: (id) => arriving.has(id),
    shown(id) {
      arriving.delete(id);
    },
  };
}
