import { useCallback, useState } from "react";
import { useLive } from "./live";
import type { Item } from "@fakkarni/shared";
import { upsertItem } from "@/db/messages";
import { patchItem } from "@/lib/api";
import { pullItems } from "@/sync/items";
import { scheduleItem } from "@/notifications";

/**
 * Items for a tab: shown from SQLite instantly (works offline), then refreshed from the
 * server when the tab is focused or pulled down.
 */
export function useItems(load: () => Promise<Item[]>) {
  const [items, setItems] = useState<Item[]>([]);

  const reloadLocal = useCallback(async () => setItems(await load()), [load]);

  const refresh = useCallback(async () => {
    try {
      // Also (re)plans notifications for items changed on the server (tasks, Session steps).
      await pullItems();
    } finally {
      await reloadLocal();
    }
  }, [reloadLocal]);

  // On view, when a chat reply or another change lands, and every 30 s while in view.
  useLive(async () => {
    await reloadLocal();
    // Quiet: no pull-to-refresh spinner for the background reloads.
    await pullItems().catch(() => {});
    await reloadLocal();
  });

  /** Mark done (or paid) and cancel its notifications. */
  const complete = useCallback(
    async (id: string) => {
      const updated = await patchItem(id, { status: "done" });
      await upsertItem(updated);
      await scheduleItem(updated);
      await reloadLocal();
    },
    [reloadLocal],
  );

  return { items, refresh, complete };
}
