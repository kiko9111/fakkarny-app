import { useCallback, useEffect, useState } from "react";
import { addUserMessage, listMessages, type LocalMessage } from "@/db/messages";
import { messagesChanged, syncBusy, syncQueue } from "@/sync";

export function useChat() {
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [typing, setTyping] = useState(false);

  const reload = useCallback(async () => {
    setMessages(await listMessages());
    setLoaded(true);
  }, []);

  useEffect(() => {
    void reload();
    const offChange = messagesChanged.subscribe(() => void reload());
    const offBusy = syncBusy.subscribe(setTyping);
    return () => {
      offChange();
      offBusy();
    };
  }, [reload]);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      await addUserMessage(text); // shown instantly, saved locally first
      await reload();
      void syncQueue.flush();
    },
    [reload],
  );

  return { messages, loaded, typing, send };
}
