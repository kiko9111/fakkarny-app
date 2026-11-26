import { useCallback, useEffect, useRef, useState } from "react";
import { kvGet, kvSet } from "@/db/kv";
import { draftUserMessage, listMessages, saveUserMessage, type LocalMessage } from "@/db/messages";
import { draftTime, keepSame, withDrafts } from "./list";
import { ensurePermissionAndRegister } from "@/notifications";
import { chatLocked, isChatLocked, messagesChanged, syncBusy, syncQueue } from "@/sync";

export function useChat() {
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [typing, setTyping] = useState(false);
  const [locked, setLocked] = useState(isChatLocked);

  /** Typed a moment ago and not in the phone's store yet. */
  const drafts = useRef<LocalMessage[]>([]);
  const shown = useRef(messages);
  shown.current = messages;

  const reload = useCallback(async () => {
    const rows = await listMessages();
    // A draft is done once the store hands it back. Until then it stays on screen, also when a
    // reload that left before it was written lands after.
    if (drafts.current.length) {
      const stored = new Set(rows.map((m) => m.client_id));
      drafts.current = drafts.current.filter((d) => !stored.has(d.client_id));
    }
    // Bubbles that did not change keep their objects, so only what changed redraws.
    setMessages((prev) => keepSame(prev, withDrafts(rows, drafts.current)));
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
      // On screen in the same frame as the tap; the phone's store and the server follow.
      const draft = draftUserMessage(text, draftTime(Date.now(), shown.current[shown.current.length - 1]?.created_at));
      drafts.current = [...drafts.current, draft];
      setMessages((prev) => [...prev, draft]);
      try {
        await saveUserMessage(draft); // saved locally first, sent after
      } catch (err) {
        drafts.current = drafts.current.filter((d) => d !== draft);
        await reload().catch(() => {});
        throw err;
      }
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
