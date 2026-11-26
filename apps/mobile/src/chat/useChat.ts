import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { kvGet, kvSet } from "@/db/kv";
import { draftUserMessage, listMessages, saveUserMessage, type LocalMessage } from "@/db/messages";
import { draftTime, keepSame, withDrafts } from "./list";
import { ensurePermissionAndRegister } from "@/notifications";
import { chatLocked, isChatLocked, messagesChanged, replyWriting, syncBusy, syncQueue } from "@/sync";
import { addWriting, replyStored, withWriting, type Writing } from "./writing";

/** The words of a reply being written are drawn at most this often (each draw lays the bubble out again). */
const WRITING_EVERY_MS = 60;
/** A draft whose stored reply never shows up is dropped after this long. */
const WRITING_LEFT_MS = 4_000;

export function useChat() {
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [typing, setTyping] = useState(false);
  const [locked, setLocked] = useState(isChatLocked);

  /** Zaki's reply while he is still writing it (sync/stream.ts); the stored reply takes its place. */
  const [writing, setWriting] = useState<Writing | null>(null);
  const latest = useRef<Writing | null>(null);
  const paint = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showWriting = useCallback((next: Writing | null, now = false) => {
    latest.current = next;
    if (paint.current && !now) return;
    if (paint.current) clearTimeout(paint.current);
    paint.current = null;
    if (now) return setWriting(next);
    paint.current = setTimeout(() => {
      paint.current = null;
      setWriting(latest.current);
    }, WRITING_EVERY_MS);
  }, []);

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
    // The finished reply is in: it stands where its draft stood.
    if (replyStored(rows, latest.current)) showWriting(null, true);
    setLoaded(true);
  }, [showWriting]);

  useEffect(() => {
    void reload();
    const offChange = messagesChanged.subscribe(() => void reload());
    const offBusy = syncBusy.subscribe(setTyping);
    const offLocked = chatLocked.subscribe(setLocked);
    let left: ReturnType<typeof setTimeout> | null = null;
    const offWriting = replyWriting.subscribe((w) => {
      if (left) clearTimeout(left);
      left = null;
      if (w.kind === "words") return showWriting(addWriting(latest.current, w.clientId, w.bubble, w.delta));
      // Written again, or the send failed: the words shown are void.
      if (w.kind === "reset" || !w.ok) return showWriting(null, true);
      // Over and answered: the draft stays until the stored reply is in the list (`reload`).
      left = setTimeout(() => showWriting(null, true), WRITING_LEFT_MS);
    });
    return () => {
      offChange();
      offBusy();
      offLocked();
      offWriting();
      if (left) clearTimeout(left);
      if (paint.current) clearTimeout(paint.current);
      paint.current = null;
    };
  }, [reload, showWriting]);

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

  // The reply being written sits under the message it answers, as rows of its own.
  const withReply = useMemo(() => withWriting(messages, writing), [messages, writing]);
  return { messages: withReply, loaded, typing, locked, send, writing: withReply === messages ? null : writing };
}
