import { insertServerMessages, upsertItem } from "@/db/messages";
import { listItems, listMessagesPage } from "@/lib/api";
import { scheduleItems } from "@/notifications";
import { messagesChanged } from "./index";

/**
 * FR-10: after signing in on a (new) phone, download the whole chat and every item,
 * so the same conversation and reminders appear here.
 */
export async function fullSync(): Promise<void> {
  let after: string | null = null;
  for (;;) {
    const { messages } = await listMessagesPage(after, 200);
    if (messages.length === 0) break;
    await insertServerMessages(messages);
    after = messages[messages.length - 1]!.created_at;
    if (messages.length < 200) break;
  }
  const items = await listItems();
  for (const item of items) await upsertItem(item);
  await scheduleItems(items.filter((i) => i.status === "open"));
  messagesChanged.emit();
}
