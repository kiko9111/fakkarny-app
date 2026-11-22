import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { FlatList, KeyboardAvoidingView, StyleSheet, View } from "react-native";
import { router, useNavigation } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useNetworkState } from "expo-network";
import { ChatInput } from "@/chat/ChatInput";
import { MessageBubble } from "@/chat/MessageBubble";
import { QuickReplies } from "@/chat/QuickReplies";
import { TypingIndicator } from "@/chat/TypingIndicator";
import { useChat } from "@/chat/useChat";
import type { LocalMessage } from "@/db/messages";
import { t } from "@/i18n";
import { getMe } from "@/lib/api";
import { Button, Note, palette, space, Text, ZakiAvatar } from "@/ui";

const GREETING: LocalMessage = {
  client_id: "local:greeting",
  role: "friend",
  kind: "chat",
  text: t.chat.greeting,
  created_at: new Date(0).toISOString(),
  sync_status: "synced",
  saved: null,
};

/** The header: Zaki's face, his name, and what he is doing right now. */
function ZakiHeader({ typing }: { typing: boolean }) {
  return (
    <View style={styles.header}>
      <ZakiAvatar size={36} />
      <View>
        <Text variant="headline" style={styles.headerName}>
          {t.ui.tabZaki}
        </Text>
        <Text variant="caption" color={typing ? palette.primaryInk : palette.ok}>
          {typing ? t.ui.zakiTyping : t.ui.zakiOnline}
        </Text>
      </View>
    </View>
  );
}

export default function ChatScreen() {
  const { messages, loaded, typing, locked, send } = useChat();
  const navigation = useNavigation();
  // New users are asked to start the trial; lapsed subscribers see that everything is saved.
  const [neverSubscribed, setNeverSubscribed] = useState(true);
  useEffect(() => {
    if (locked) void getMe().then((u) => setNeverSubscribed(u.plan === "none")).catch(() => {});
  }, [locked]);
  const headerHeight = useHeaderHeight();
  const network = useNetworkState();
  const offline = network.isConnected === false || network.isInternetReachable === false;

  useLayoutEffect(() => {
    navigation.setOptions({ headerTitle: () => <ZakiHeader typing={typing && !offline} /> });
  }, [navigation, typing, offline]);

  // Inverted list: newest at the bottom, keyboard-friendly.
  const data = useMemo(() => {
    const all = loaded && messages.length === 0 ? [GREETING] : messages;
    return [...all].reverse();
  }, [messages, loaded]);

  // Android is edge-to-edge, so the window no longer resizes for the keyboard: padding on both platforms.
  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding" keyboardVerticalOffset={headerHeight}>
      {offline ? (
        <View style={styles.offline}>
          <Note icon="cloud-offline-outline" tone="warn">
            {t.chat.offline}
          </Note>
        </View>
      ) : null}
      <FlatList
        style={styles.flex}
        contentContainerStyle={styles.list}
        data={data}
        inverted
        keyExtractor={(m) => m.client_id}
        // In the inverted list, index-1 sits just below on screen and index+1 just above.
        renderItem={({ item, index }) => <MessageBubble message={item} lastInRun={data[index - 1]?.role !== item.role} firstInRun={data[index + 1]?.role !== item.role} />}
        ListHeaderComponent={typing && !offline ? <TypingIndicator /> : undefined}
        keyboardShouldPersistTaps="handled"
      />
      {locked ? (
        // FR-9: chat locks without a subscription; history stays readable, queued messages send after subscribing.
        <View style={styles.lock}>
          <Text variant="body" align="center">
            {neverSubscribed ? t.paywall.lockedNew : t.paywall.locked}
          </Text>
          <Button label={t.paywall.cta} icon="sparkles" block onPress={() => router.push("/paywall")} />
        </View>
      ) : (
        <>
          <QuickReplies options={t.chat.quickReplies} onPick={(text) => void send(text)} />
          <ChatInput onSend={(text) => void send(text)} />
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.bg },
  header: { flexDirection: "row", alignItems: "center", gap: space.sm + 2 },
  headerName: { lineHeight: 22 },
  list: { paddingHorizontal: space.md, paddingVertical: space.sm },
  offline: { paddingHorizontal: space.md, paddingTop: space.xs },
  lock: { padding: space.lg, gap: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line, backgroundColor: palette.surface },
});
