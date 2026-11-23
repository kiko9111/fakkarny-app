import { useCallback, useEffect, useState } from "react";
import { kvGet, kvSet } from "@/db/kv";
import { addUserMessage, listMessages, type LocalMessage } from "@/db/messages";
import { ensurePermissionAndRegister } from "@/notifications";
import { chatLocked, isChatLocked, messagesChanged, syncBusy, syncQueue } from "@/sync";

export function useChat() {
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [typing, setTyping] = useState(false);
  const [locked, setLocked] = useState(isChatLocked);

  const reload = useCallback(async () => {
    setMessages(await listMessages());
    setLoaded(true);
  }, []);

  useEffect(() => {
    void reload();
    const offChange = messagesChanged.subscribe(() => void reload());
    const offBusy = syncBusy.subscribe(setTyping);
    const offLocked = chatLocked.subscribe(setLocked);
    return () => {
      offChange();
      offBusy();
      offLocked();
    };
  }, [reload]);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      await addUserMessage(text); // shown instantly, saved locally first
      await reload();
      // Resolves once this send attempt is over (reply in, or offline), so callers can follow up.
      const flushing = syncQueue.flush().catch(() => {});
      // F1: after the first real exchange, ask for notifications "so I can check on you".
      if (!(await kvGet("asked_notifications"))) {
        await kvSet("asked_notifications", "1");
        setTimeout(() => void ensurePermissionAndRegister(), 1500);
      }
      await flushing;
    },
    [reload],
  );

  return { messages, loaded, typing, locked, send };
}
