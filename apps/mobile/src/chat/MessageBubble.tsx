import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import type { LocalMessage } from "@/db/messages";
import { t } from "@/i18n";
import { colors } from "@/lib/theme";

export const MessageBubble = memo(function MessageBubble({ message }: { message: LocalMessage }) {
  const mine = message.role === "user";
  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowFriend]}>
      <View style={[styles.bubble, mine ? styles.mine : styles.friend]}>
        <Text style={[styles.text, mine && styles.textMine]}>{message.text}</Text>
      </View>
      {message.kind === "upsell" ? (
        <Pressable style={styles.proButton} onPress={() => router.push("/paywall")} accessibilityRole="button">
          <Text style={styles.proText}>{t.paywall.upsellButton}</Text>
        </Pressable>
      ) : null}
      {mine && message.sync_status !== "synced" ? (
        <Text style={[styles.status, message.sync_status === "failed" && styles.failed]}>
          {message.sync_status === "pending" ? `⏱ ${t.chat.pending}` : `⚠ ${t.chat.failed}`}
        </Text>
      ) : null}
      {message.saved ? (
        <Pressable
          style={styles.savedChip}
          onPress={() => router.push({ pathname: "/saved/[clientId]", params: { clientId: message.client_id } })}
          accessibilityRole="button"
        >
          <Text style={styles.savedText} numberOfLines={1}>
            ✓ {t.chat.saved}: {[...message.saved.items.map((i) => i.title), ...message.saved.memories.map((m) => m.subject)].join(" · ")}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { marginVertical: 3, maxWidth: "85%" },
  // alignSelf flex-end/flex-start flips automatically in RTL.
  rowMine: { alignSelf: "flex-end", alignItems: "flex-end" },
  rowFriend: { alignSelf: "flex-start", alignItems: "flex-start" },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 },
  mine: { backgroundColor: colors.accent },
  friend: { backgroundColor: colors.friendBubble },
  text: { fontSize: 16, lineHeight: 22, color: colors.text, writingDirection: "auto" },
  textMine: { color: "#fff" },
  status: { fontSize: 11, color: colors.muted, marginTop: 2 },
  failed: { color: colors.error },
  proButton: { marginTop: 6, backgroundColor: colors.accent, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8 },
  proText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  savedChip: { marginTop: 4, backgroundColor: "#EAF4EE", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  savedText: { fontSize: 12, color: colors.ok },
});
