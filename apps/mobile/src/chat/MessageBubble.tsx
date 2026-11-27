import { memo, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import type { MessageKind } from "@fakkarni/shared";
import type { LocalMessage } from "@/db/messages";
import { t, dateLocale } from "@/i18n";
import { track } from "@/lib/analytics";
import { shareInvite } from "@/referral/share";
import { ActionCards } from "./ActionCards";
import type { Entrance } from "./entrance";
import { TypingDots } from "./TypingIndicator";
import { Appear, glass, Button, Icon, palette, radius, shadow, space, Text, ZakiAvatar, type IconName } from "@/ui";

/** Friend messages that Zaki started himself get a small label, so they read as his idea. */
const KIND: Partial<Record<MessageKind, { icon: IconName; label: () => string; color: string }>> = {
  morning: { icon: "sunny", label: () => t.ui.kindMorning, color: palette.friends },
  night: { icon: "moon", label: () => t.ui.kindNight, color: palette.calm },
  reminder: { icon: "alarm", label: () => t.ui.kindReminder, color: palette.primaryInk },
  followup: { icon: "chatbubble-ellipses", label: () => t.ui.kindFollowup, color: palette.primaryInk },
  checkin: { icon: "hand-left", label: () => t.ui.kindCheckin, color: palette.primaryInk },
  update: { icon: "people", label: () => t.ui.kindUpdate, color: palette.family },
};

const time = (iso: string) => {
  const d = new Date(iso);
  return d.getTime() > 0 ? d.toLocaleTimeString(dateLocale, { hour: "numeric", minute: "2-digit" }) : "";
};

/**
 * One chat message. `lastInRun` is the bottom bubble of a run from the same sender: it gets
 * Zaki's face (friend side) and the time, so a burst of replies reads as one turn.
 * `writing`: Zaki is still writing this one (chat/writing.ts): the dots stay under the words of
 * the last bubble and it has no time yet. `heard`: Zaki is already answering this message of the
 * user's, so it no longer says "Sending…" (the server stores both when the reply is done).
 * `day`: this is the first message of its day, and the day is written above it (chat/days.ts).
 * `entrance`: a message that arrives while the chat is open rises into place, once
 * (chat/entrance.ts); what was already there, or scrolls back into view, is drawn in place.
 */
export const MessageBubble = memo(function MessageBubble({
  message,
  lastInRun = true,
  firstInRun = true,
  writing = false,
  heard = false,
  day = null,
  entrance,
}: {
  message: LocalMessage;
  lastInRun?: boolean;
  firstInRun?: boolean;
  writing?: boolean;
  heard?: boolean;
  day?: string | null;
  entrance?: Entrance;
}) {
  const mine = message.role === "user";
  const kind = !mine ? KIND[message.kind] : undefined;
  // Decided once, when the bubble first shows. The words of a reply still being written and the
  // stored reply that takes their place are the same bubble, so it arrives once.
  const [arrives] = useState(() => entrance?.fresh(message.client_id) ?? false);
  useEffect(() => entrance?.shown(message.client_id), [entrance, message.client_id]);
  return (
    <Appear off={!arrives}>
      {day ? (
        <View style={styles.day} accessibilityRole="header">
          <Text variant="caption" color={palette.inkSoft}>
            {day}
          </Text>
        </View>
      ) : null}
      <View style={[styles.row, mine ? styles.rowMine : styles.rowFriend, firstInRun ? styles.runStart : null]}>
        {!mine ? <View style={styles.avatarSlot}>{lastInRun ? <ZakiAvatar size={28} /> : null}</View> : null}
        <View style={[styles.column, mine ? styles.colMine : styles.colFriend]}>
          {kind && firstInRun ? (
            <View style={styles.kind}>
              <Icon name={kind.icon} size={13} color={kind.color} />
              <Text variant="caption" color={kind.color}>
                {kind.label()}
              </Text>
            </View>
          ) : null}
          <View style={[styles.bubble, mine ? styles.mine : styles.friend, mine ? (lastInRun ? styles.tailMine : null) : lastInRun ? styles.tailFriend : null]}>
            <Text variant="body" color={mine ? palette.onPrimary : palette.ink}>
              {message.text}
            </Text>
            {writing && lastInRun ? <TypingDots small /> : null}
          </View>
          {!mine && message.actions.length ? <ActionCards serverId={message.server_id} actions={message.actions} /> : null}
          {message.kind === "upsell" ? (
            // Out of free AI messages: inviting a friend comes first (both get 7 Pro days), then Pro.
            <View style={styles.upsell}>
              <Button label={t.referral.inviteButton} icon="heart" size="sm" onPress={() => void shareInvite("upsell")} />
              <Button
                label={t.paywall.upsellButton}
                icon="sparkles"
                size="sm"
                kind="tonal"
                onPress={() => {
                  track("paywall_opened", { from: "upsell" });
                  router.push("/paywall");
                }}
              />
            </View>
          ) : null}
          {message.saved ? (
            <Pressable style={({ pressed }) => [styles.savedChip, pressed && { opacity: 0.7 }]} onPress={() => router.push({ pathname: "/saved/[clientId]", params: { clientId: message.client_id } })} accessibilityRole="button">
              <Icon name="bookmark" size={13} color={palette.ok} />
              <Text variant="caption" color={palette.ok} numberOfLines={1} style={styles.savedText}>
                {t.chat.saved}: {[...message.saved.items.map((i) => i.title), ...message.saved.memories.map((m) => m.subject)].join(" · ")}
              </Text>
            </Pressable>
          ) : null}
          {mine && message.sync_status !== "synced" && !(heard && message.sync_status === "pending") ? (
            <View style={styles.meta}>
              <Icon name={message.sync_status === "pending" ? "time-outline" : "alert-circle-outline"} size={13} color={message.sync_status === "failed" ? palette.danger : palette.inkFaint} />
              <Text variant="caption" color={message.sync_status === "failed" ? palette.danger : palette.inkFaint}>
                {message.sync_status === "pending" ? t.chat.pending : t.chat.failed}
              </Text>
            </View>
          ) : lastInRun && !writing && time(message.created_at) ? (
            <Text variant="caption" color={palette.inkFaint} style={styles.time}>
              {time(message.created_at)}
            </Text>
          ) : null}
        </View>
      </View>
    </Appear>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", gap: space.sm, marginVertical: 2, maxWidth: "88%" },
  runStart: { marginTop: space.md },
  // alignSelf flex-end/flex-start flips automatically in RTL.
  rowMine: { alignSelf: "flex-end" },
  rowFriend: { alignSelf: "flex-start" },
  avatarSlot: { width: 28, marginBottom: 22 },
  column: { flexShrink: 1, gap: 3 },
  colMine: { alignItems: "flex-end" },
  colFriend: { alignItems: "flex-start" },
  kind: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 4 },
  bubble: { borderRadius: 20, paddingHorizontal: space.lg - 2, paddingVertical: space.sm + 1 },
  mine: { backgroundColor: palette.primary, ...shadow.button },
  friend: { ...glass },
  tailMine: { borderBottomEndRadius: 6 },
  tailFriend: { borderBottomStartRadius: 6 },
  upsell: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: 2 },
  savedChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: palette.okSoft, borderRadius: radius.pill, paddingHorizontal: space.sm + 2, paddingVertical: 4, maxWidth: 280 },
  savedText: { flexShrink: 1 },
  meta: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 4 },
  time: { paddingHorizontal: 4 },
  // The day, centred between the messages of two days.
  day: { alignSelf: "center", marginTop: space.lg, marginBottom: space.xs, paddingHorizontal: space.md, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.62)", borderWidth: 1, borderColor: palette.glassEdge },
});
