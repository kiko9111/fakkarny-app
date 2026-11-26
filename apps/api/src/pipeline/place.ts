import { titleWithoutPlace, type FriendResponse, type PlaceTrigger } from "@fakkarni/shared";

/**
 * Puts a place on what the turn creates: every reminder or task, else the first shopping item
 * (the model often reads "buy bread when I'm at the supermarket" as a list item), else a new
 * task made from the message. A place on an item that already has a time keeps the time.
 */
export function withPlace<A extends Pick<FriendResponse, "create_items" | "update_items">>(actions: A, trigger: PlaceTrigger, text: string): A {
  const place = { place: trigger.place, place_on: trigger.on };
  const timed = (i: { type: string }) => i.type === "reminder" || i.type === "task";
  if (actions.create_items.some(timed)) return { ...actions, create_items: actions.create_items.map((i) => (timed(i) ? { ...i, ...place } : i)) };
  const list = actions.create_items.findIndex((i) => i.type === "list_item");
  if (list >= 0) return { ...actions, create_items: actions.create_items.map((i, n) => (n === list ? { type: "task" as const, title: i.title, ...place } : i)) };
  // "When I get to work, mark the dentist done": the turn changes something else; leave it.
  if (actions.update_items.length || actions.create_items.some((i) => i.type === "debt")) return actions;
  return { ...actions, create_items: [...actions.create_items, { type: "task" as const, title: titleWithoutPlace(text, trigger).slice(0, 200), ...place }] };
}
