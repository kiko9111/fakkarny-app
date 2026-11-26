import { memo, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router, type Href } from "expo-router";
import type { ChatAction } from "@fakkarni/shared";
import { setActions } from "@/db/messages";
import { actOnChatAction } from "@/lib/api";
import { featureOfRoute } from "@/lib/unlock";
import { unlock } from "@/lib/unlock-store";
import { messagesChanged } from "@/sync";
import { dataChanged } from "@/lib/live";
import { pullItems } from "@/sync/items";
import { t } from "@/i18n";
import { notify } from "@/ui/feedback";
import { Button, Icon, palette, radius, space, Text, type IconName } from "@/ui";

const LOOK: Record<ChatAction["status"], { icon: IconName; color: string; bg: string }> = {
  done: { icon: "checkmark-circle", color: palette.ok, bg: palette.okSoft },
  pending: { icon: "help-circle", color: palette.primaryInk, bg: palette.primarySoftGlass },
  cancelled: { icon: "close-circle", color: palette.inkFaint, bg: palette.surface },
  failed: { icon: "alert-circle", color: palette.warn, bg: palette.warnSoft },
};

/**
 * Opening a card's place also opens that tab for a chat-first user. A tab that was hidden a
 * moment ago can't be navigated to in the same frame (`href: null`), so wait for the re-render.
 */
function open(route: string) {
  const place = featureOfRoute(route);
  const wasClosed = place !== null && !unlock.isOpen(place);
  if (place) unlock.open(place);
  if (wasClosed) setTimeout(() => router.navigate(route as Href), 60);
  else router.push(route as Href);
}

/** Pending cards that answer or change something (rather than send): the button says Yes. */
const YES_KINDS = new Set(["task_answer", "daftar_answer", "homework_review", "checkin", "leave_circle", "delete_section", "delete_tracker", "daftar_settle", "daftar_cancel", "task_cancel"]);

/**
 * Under one of Zaki's replies: what he did in the app (tap to open it), or what he wants to do
 * that reaches other people (Send / Cancel). Answering "yes" in the chat works too.
 */
export const ActionCards = memo(function ActionCards({ serverId, actions }: { serverId: string | null; actions: ChatAction[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  // Cancel and Undo are the user's own "no": the card shows it in the same frame. Yes and Send
  // wait for the server, because a card says "sent" only when it is.
  const [guess, setGuess] = useState<Record<string, ChatAction["status"]>>({});
  // The stored cards changed (the server's answer is in): the guess has done its job.
  useEffect(() => setGuess((g) => (Object.keys(g).length ? {} : g)), [actions]);
  if (!actions.length) return null;

  const answer = async (card: ChatAction, confirm: boolean | "undo") => {
    if (!serverId || busy) return;
    setBusy(card.id);
    if (confirm !== true) setGuess((g) => ({ ...g, [card.id]: "cancelled" }));
    try {
      const updated = await actOnChatAction(serverId, card.id, confirm);
      // The server's word takes the guess's place: when it changed nothing (an undo it no longer
      // allows), the stored cards stay the same and the guess would never be cleared.
      const said = updated.actions.find((a) => a.id === card.id)?.status;
      setGuess(({ [card.id]: _guessed, ...rest }) => (said ? { ...rest, [card.id]: said } : rest));
      await setActions(serverId, updated.actions);
      messagesChanged.emit();
      dataChanged.emit();
      // The answer carries the cards only: a task accepted or cancelled, homework handed in or an
      // undone reminder time changed plans too. Today shows them without being opened again.
      void pullItems();
    } catch {
      setGuess(({ [card.id]: _back, ...rest }) => rest);
      notify(t.chat.actionOffline, "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.list}>
      {actions.map((stored) => {
        const guessed = guess[stored.id];
        const card = guessed ? { ...stored, status: guessed } : stored;
        const look = LOOK[card.status] ?? LOOK.done;
        const tappable = card.status === "done" && !!card.route;
        const content = (
          <>
            <View style={styles.head}>
              <Icon name={look.icon} size={16} color={look.color} />
              <Text variant="small" color={palette.ink} style={styles.label}>
                {card.label}
              </Text>
              {tappable ? (
                <View style={styles.chev}>
                  <Icon name="chevron-forward" size={14} color={palette.inkFaint} />
                </View>
              ) : null}
            </View>
            {card.status === "pending" ? (
              <View style={styles.buttons}>
                <Button
                  label={card.kind === "log_money" ? t.chat.actionAdd : YES_KINDS.has(card.kind) ? t.chat.actionYes : t.chat.actionSend}
                  icon={card.kind === "log_money" ? "add" : YES_KINDS.has(card.kind) ? "checkmark" : "send"}
                  size="sm"
                  busy={busy === card.id}
                  disabled={!serverId || (busy !== null && busy !== card.id)}
                  onPress={() => void answer(card, true)}
                />
                <Button label={t.chat.actionCancel} size="sm" kind="text" disabled={!serverId || busy !== null} onPress={() => void answer(card, false)} />
              </View>
            ) : null}
            {card.status === "done" && card.undoable ? (
              <View style={styles.buttons}>
                <Button label={t.chat.actionUndo} icon="arrow-undo" size="sm" kind="text" busy={busy === card.id} disabled={!serverId || busy !== null} onPress={() => void answer(card, "undo")} />
              </View>
            ) : null}
          </>
        );
        // A plain View when there is nothing to open: a disabled Pressable would also
        // disable the Send / Cancel buttons inside it on the web.
        return tappable ? (
          <Pressable key={card.id} onPress={() => open(card.route!)} accessibilityRole="button" style={({ pressed }) => [styles.card, { backgroundColor: look.bg }, pressed && { opacity: 0.75 }]}>
            {content}
          </Pressable>
        ) : (
          <View key={card.id} style={[styles.card, { backgroundColor: look.bg }]}>
            {content}
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  list: { gap: space.xs, alignSelf: "stretch", maxWidth: 320 },
  card: { borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm, borderWidth: 1, borderColor: palette.glassEdge, gap: space.sm },
  head: { flexDirection: "row", alignItems: "center", gap: space.xs + 2 },
  label: { flexShrink: 1 },
  chev: { marginStart: "auto" },
  buttons: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
