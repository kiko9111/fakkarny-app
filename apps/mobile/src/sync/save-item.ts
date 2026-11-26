import type { Item } from "@fakkarni/shared";
import { upsertItem } from "@/db/messages";
import { itemsChanged } from "@/lib/signals";
import { scheduleItem } from "@/notifications";

/**
 * Save an item the server answered with. Every list of plans redraws at once (Today, Upcoming,
 * the Alarms list), and its notifications are re-planned in the background: changed for a new
 * time, title or alarm, cleared when it is done or cancelled. Nothing waits for them.
 */
export async function saveItem(item: Item): Promise<void> {
  if (!(await upsertItem(item))) return;
  itemsChanged.emit();
  scheduleItem(item);
}
