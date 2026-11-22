import { localItemVersions } from "@/db/items";
import { upsertItem } from "@/db/messages";
import { listItems } from "@/lib/api";
import { scheduleItem } from "@/notifications";
import { changedItems } from "./changed";

let pulling: Promise<void> | null = null;

/**
 * Bring down items the server made or changed outside the chat (an accepted circle task, a
 * Session step, a task the assigner cancelled or finished) and (re)plan their local
 * notifications, so a reminder fires, or stops, without opening the Upcoming tab.
 */
export function pullItems(): Promise<void> {
  pulling ??= (async () => {
    try {
      const [server, local] = await Promise.all([listItems(), localItemVersions()]);
      for (const item of changedItems(server, local)) {
        await upsertItem(item);
        await scheduleItem(item);
      }
    } catch {
      // offline: try again on the next foreground
    } finally {
      pulling = null;
    }
  })();
  return pulling;
}
