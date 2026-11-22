import type { Item } from "@fakkarni/shared";

/** Server items that are new here or newer than the local copy (pure). */
export function changedItems(server: readonly Item[], local: ReadonlyMap<string, string>): Item[] {
  return server.filter((i) => {
    const mine = local.get(i.id);
    return mine === undefined || Date.parse(i.updated_at) > Date.parse(mine);
  });
}
