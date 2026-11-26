import {
  foldThing,
  listsForPlace,
  sortListItems,
  splitThings,
  type HouseList,
  type HouseListItem,
  type ListPlace,
} from "@fakkarni/shared";

export { listsForPlace, sortListItems, splitThings };

/**
 * Household lists on the phone: the guesses drawn the moment the user taps (lib/optimistic.ts),
 * before the server answers. Pure, so they are tested without React Native.
 */

const openCount = (items: HouseListItem[]) =>
  items.filter((i) => !i.done).length;
const withItems = (
  list: HouseList,
  items: HouseListItem[],
  now: Date,
): HouseList => ({
  ...list,
  items,
  open_count: openCount(items),
  updated_at: now.toISOString(),
});

/** New things at the end of the open ones; something already open on the list is left out. */
export function guessAdd(
  list: HouseList,
  things: { id: string; title: string; qty: string | null }[],
  me: string | null,
  now: Date,
): HouseList {
  const open = new Set(
    list.items.filter((i) => !i.done).map((i) => foldThing(i.title)),
  );
  const fresh: HouseListItem[] = [];
  for (const t of things) {
    const key = foldThing(t.title);
    if (!key || open.has(key)) continue;
    open.add(key);
    fresh.push({
      id: t.id,
      title: t.title,
      qty: t.qty,
      added_by_name: me,
      is_mine: true,
      done: false,
      done_by_name: null,
      done_at: null,
      created_at: now.toISOString(),
    });
  }
  return fresh.length ? withItems(list, [...list.items, ...fresh], now) : list;
}

/** Things typed in the box that are already open on the list (to say so instead of adding). */
export function alreadyOn(
  list: HouseList,
  things: { title: string }[],
): string[] {
  const open = new Map(
    list.items.filter((i) => !i.done).map((i) => [foldThing(i.title), i.title]),
  );
  return things.flatMap((t) =>
    open.has(foldThing(t.title)) ? [open.get(foldThing(t.title))!] : [],
  );
}

export function guessDone(
  list: HouseList,
  itemId: string,
  done: boolean,
  me: string | null,
  now: Date,
): HouseList {
  return withItems(
    list,
    list.items.map((i) =>
      i.id === itemId
        ? {
            ...i,
            done,
            done_by_name: done ? me : null,
            done_at: done ? now.toISOString() : null,
          }
        : i,
    ),
    now,
  );
}

export const guessRemove = (
  list: HouseList,
  itemId: string,
  now: Date,
): HouseList =>
  withItems(
    list,
    list.items.filter((i) => i.id !== itemId),
    now,
  );
export const guessClear = (list: HouseList, now: Date): HouseList =>
  withItems(
    list,
    list.items.filter((i) => !i.done),
    now,
  );

/** The quick chips: the usual things that are not open on the list already. */
export function quickPicks(list: HouseList, picks: string[]): string[] {
  const open = new Set(
    list.items.filter((i) => !i.done).map((i) => foldThing(i.title)),
  );
  return picks.filter((p) => !open.has(foldThing(p)));
}

/** The lists screen: lists with someone out shopping first, then the fullest, then the newest. */
export function sortLists(lists: HouseList[]): HouseList[] {
  return [...lists].sort(
    (a, b) =>
      Number(Boolean(b.trip)) - Number(Boolean(a.trip)) ||
      b.open_count - a.open_count ||
      b.updated_at.localeCompare(a.updated_at),
  );
}

/** A short line under a list's name: the first few open things. */
export function preview(list: HouseList, comma: string, max = 4): string {
  const open = sortListItems(list.items).filter((i) => !i.done);
  const shown = open.slice(0, max).map((i) => i.title);
  return open.length > max ? `${shown.join(comma)}…` : shown.join(comma);
}

export const PLACE_ICON: Record<
  ListPlace,
  | "cart-outline"
  | "medkit-outline"
  | "pizza-outline"
  | "restaurant-outline"
  | "home-outline"
  | "list-outline"
> = {
  grocery: "cart-outline",
  pharmacy: "medkit-outline",
  bakery: "pizza-outline",
  butcher: "restaurant-outline",
  home: "home-outline",
  other: "list-outline",
};
