import { useMemo } from "react";
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { useNetworkState } from "expo-network";
import { ChatInput } from "@/chat/ChatInput";
import { MessageBubble } from "@/chat/MessageBubble";
import { QuickReplies } from "@/chat/QuickReplies";
import { TypingIndicator } from "@/chat/TypingIndicator";
import { useChat } from "@/chat/useChat";
import type { LocalMessage } from "@/db/messages";
import { t } from "@/i18n";
import { colors } from "@/lib/theme";

const GREETING: LocalMessage = {
  client_id: "local:greeting",
  role: "friend",
  kind: "chat",
  text: t.chat.greeting,
  created_at: new Date(0).toISOString(),
  sync_status: "synced",
  saved: null,
};

export default function ChatScreen() {
  const { messages, loaded, typing, send } = useChat();
  const network = useNetworkState();
  const offline = network.isConnected === false || network.isInternetReachable === false;

  // Inverted list: newest at the bottom, keyboard-friendly.
  const data = useMemo(() => {
    const all = loaded && messages.length === 0 ? [GREETING] : messages;
    return [...all].reverse();
  }, [messages, loaded]);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      {offline ? (
        <View style={styles.offline}>
          <Text style={styles.offlineText}>{t.chat.offline}</Text>
        </View>
      ) : null}
      <FlatList
        style={styles.flex}
        contentContainerStyle={styles.list}
        data={data}
        inverted
        keyExtractor={(m) => m.client_id}
        renderItem={({ item }) => <MessageBubble message={item} />}
        ListHeaderComponent={typing && !offline ? <TypingIndicator /> : undefined}
        keyboardShouldPersistTaps="handled"
      />
      <QuickReplies options={t.chat.quickReplies} onPick={(text) => void send(text)} />
      <ChatInput onSend={(text) => void send(text)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  list: { paddingHorizontal: 12, paddingVertical: 8 },
  offline: { backgroundColor: "#FFF3CD", paddingHorizontal: 12, paddingVertical: 6 },
  offlineText: { color: "#7A5B00", fontSize: 13, textAlign: "center" },
});
