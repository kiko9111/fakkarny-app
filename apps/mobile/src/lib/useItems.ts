import { useCallback, useRef, useState } from "react";
import { useLive } from "./live";
import type { Item } from "@fakkarni/shared";
import { upsertItem } from "@/db/messages";
import { completeItem } from "@/lib/api";
import { pullItems } from "@/sync/items";
import { QueuedOffline } from "@/sync/writes";
import { scheduleItem } from "@/notifications";
import { t } from "@/i18n";
import { notify } from "@/ui/feedback";

/**
 * Items for a tab: shown from SQLite instantly (works offline), then refreshed from the
 * server when the tab is focused or pulled down.
 */
export function useItems(load: () => Promise<Item[]>) {
  const [items, setItems] = useState<Item[]>([]);
  const shown = useRef(items);
  shown.current = items;

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

  /**
   * Mark done (or paid) and cancel its notifications. The row leaves the list in the same frame
   * and the phone's own copy is closed first (it keeps its `updated_at`, so whatever the server
   * says later wins); the server follows, also later when there is no connection. A refusal puts
   * the row back.
   */
  const complete = useCallback(
    async (id: string) => {
      const item = shown.current.find((i) => i.id === id);
      if (!item) return;
      const done: Item = { ...item, status: "done", done_at: new Date().toISOString() };
      setItems((all) => all.filter((i) => i.id !== id));
      await upsertItem(done);
      await scheduleItem(done);
      try {
        const updated = await completeItem(id);
        await upsertItem(updated);
        await scheduleItem(updated);
      } catch (err) {
        // No connection: it stays done here and goes out with the next refresh.
        if (err instanceof QueuedOffline) return;
        await upsertItem(item);
        await scheduleItem(item);
        await reloadLocal();
        notify(t.tasks.failed, "error");
        throw err;
      }
    },
    [reloadLocal],
  );

  return { items, refresh, complete };
}
