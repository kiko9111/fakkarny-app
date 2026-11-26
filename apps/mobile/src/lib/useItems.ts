import { useCallback, useEffect, useRef, useState } from "react";
import { useLive } from "./live";
import type { Item } from "@fakkarni/shared";
import { upsertItem } from "@/db/messages";
import { completeItem } from "@/lib/api";
import { itemsChanged } from "@/lib/signals";
import { pullItems } from "@/sync/items";
import { saveItem } from "@/sync/save-item";
import { QueuedOffline } from "@/sync/writes";
import { scheduleItem } from "@/notifications";
import { t } from "@/i18n";
import { notify } from "@/ui/feedback";

/**
 * Items for a tab: shown from SQLite instantly (works offline), then refreshed from the
 * server when the tab is focused or pulled down. Plans saved anywhere else (a chat reply, a pull,
 * a tap on another screen) show at once through `itemsChanged`, also while the tab is not in view.
 */
export function useItems(load: () => Promise<Item[]>) {
  const [items, setItems] = useState<Item[]>([]);
  const shown = useRef(items);
  shown.current = items;
  /** Plans being ticked done right now: a reload that read SQLite just before the write must not bring them back. */
  const closing = useRef(new Set<string>());

  const reloadLocal = useCallback(async () => {
    const rows = await load();
    setItems(closing.current.size ? rows.filter((i) => !closing.current.has(i.id)) : rows);
  }, [load]);

  useEffect(() => itemsChanged.subscribe(() => void reloadLocal().catch(() => {})), [reloadLocal]);

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
   * says later wins); the server follows at once, also later when there is no connection. The
   * notifications are cleared in the background: nothing here waits for them. A refusal puts the
   * row back.
   */
  const complete = useCallback(
    async (id: string) => {
      const item = shown.current.find((i) => i.id === id);
      if (!item) return;
      const done: Item = { ...item, status: "done", done_at: new Date().toISOString() };
      closing.current.add(id);
      setItems((all) => all.filter((i) => i.id !== id));
      try {
        await upsertItem(done);
        scheduleItem(done);
        // Other lists of plans (Upcoming, the Alarms list) drop it too.
        itemsChanged.emit();
        try {
          await saveItem(await completeItem(id));
        } catch (err) {
          // No connection: it stays done here and goes out with the next refresh.
          if (err instanceof QueuedOffline) return;
          await upsertItem(item);
          scheduleItem(item);
          closing.current.delete(id);
          itemsChanged.emit();
          notify(t.tasks.failed, "error");
          throw err;
        }
      } finally {
        closing.current.delete(id);
      }
    },
    [],
  );

  return { items, refresh, complete };
}
