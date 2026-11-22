import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
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
  const [refreshing, setRefreshing] = useState(false);

  const reloadLocal = useCallback(async () => setItems(await load()), [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Also (re)plans notifications for items changed on the server (tasks, Session steps).
      await pullItems();
    } finally {
      await reloadLocal();
      setRefreshing(false);
    }
  }, [reloadLocal]);

  useFocusEffect(
    useCallback(() => {
      void reloadLocal().then(refresh);
    }, [reloadLocal, refresh]),
  );

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

  return { items, refreshing, refresh, complete };
}
