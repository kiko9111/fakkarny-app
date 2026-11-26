import { localItemVersions } from "@/db/items";
import { upsertItems } from "@/db/messages";
import { listItems } from "@/lib/api";
import { oneAtATime } from "@/lib/one-at-a-time";
import { itemsChanged } from "@/lib/signals";
import { scheduleItems } from "@/notifications";
import { changedItems } from "./changed";

async function pullOnce(): Promise<void> {
  try {
    const [server, local] = await Promise.all([listItems(), localItemVersions()]);
    // Written one by one (upsertItems says why), then every list of plans redraws; notifications
    // follow in the background (on Android each one is a trip through the system, and nothing
    // waits for them).
    const wrote = await upsertItems(changedItems(server, local));
    if (!wrote.length) return;
    itemsChanged.emit();
    void scheduleItems(wrote, true);
  } catch {
    // offline: try again on the next foreground
  }
}

/**
 * Bring down items the server made or changed outside the chat (an accepted circle task, a
 * Session step, a task the assigner cancelled or finished) and (re)plan their local
 * notifications, so a reminder fires, or stops, without opening the Upcoming tab. A call made
 * while a pull is on its way gets one more pull after it: the first one may have asked the server
 * before the change the caller just made (a task accepted a moment ago).
 */
export const pullItems = oneAtATime(pullOnce);
