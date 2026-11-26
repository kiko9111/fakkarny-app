import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { FlatList, KeyboardAvoidingView, Pressable, StyleSheet, View } from "react-native";
import { router, useNavigation } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useNetworkState } from "expo-network";
import { ChatInput } from "@/chat/ChatInput";
import { MessageBubble } from "@/chat/MessageBubble";
import { QuickReplies } from "@/chat/QuickReplies";
import { TypingIndicator } from "@/chat/TypingIndicator";
import { isWriting } from "@/chat/writing";
import { useChat } from "@/chat/useChat";
import type { LocalMessage } from "@/db/messages";
import { t } from "@/i18n";
import { track } from "@/lib/analytics";
import { getMe } from "@/lib/api";
import { unlock } from "@/lib/unlock-store";
import { useStreak } from "@/lib/streak-store";
import { shareInvite } from "@/referral/share";
import { shareStreakCard } from "@/share/card";
import { fill } from "@/circles/logic";
import { suggestTracker } from "@/trackers/logic";
import { Button, glass, Icon, IconButton, Note, palette, radius, space, Text, ZakiAvatar } from "@/ui";

const GREETING: LocalMessage = {
  client_id: "local:greeting",
  role: "friend",
  kind: "chat",
  text: t.chat.greeting,
  created_at: new Date(0).toISOString(),
  sync_status: "synced",
  saved: null,
  server_id: null,
  actions: [],
};

/** The header: Zaki's face, his name, and what he is doing right now. */
/** Days in a row with Zaki, from the second day on. Light: a flame and a number. */
function StreakPill() {
  const days = useStreak();
  if (days < 2) return null;
  return (
    <Pressable
      style={styles.streak}
      accessibilityRole="button"
      accessibilityLabel={fill(t.ui.streakA11y, { n: days })}
      onPress={() => {
        track("streak_shared", { days });
        // The picture first (for Status and Stories); the invite text if it can't be made.
        void shareStreakCard(days).then((ok) => (ok ? undefined : shareInvite("streak", fill(t.referral.streakShareText, { n: days, url: "{url}" }))));
      }}
    >
      <Icon name="flame" size={16} color={palette.warn} />
      <Text variant="bodyStrong" color={palette.ink}>
        {days}
      </Text>
    </Pressable>
  );
}

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
  const { messages, loaded, typing, locked, send, writing } = useChat();
  // "عايز أتعود على القراية كل يوم" → offer a tracker with one tap (rules on the phone, no AI call).
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const say = (text: string) => {
    const followUp = unlock.onUserMessage(text);
    setSuggestion(suggestTracker(text));
    void send(text).then(followUp).catch(() => {});
  };
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
    navigation.setOptions({
      headerTitle: () => <ZakiHeader typing={typing && !offline} />,
      headerRight: () => <StreakPill />,
    });
  }, [navigation, typing, offline]);

  const fresh = loaded && messages.length === 0;
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
        renderItem={({ item, index }) => (
          <MessageBubble message={item} lastInRun={data[index - 1]?.role !== item.role} firstInRun={data[index + 1]?.role !== item.role} writing={isWriting(item, writing)} heard={writing?.clientId === item.client_id} />
        )}
        // Rows also depend on the reply being written (its dots, "Sending…" on the message it answers).
        extraData={writing}
        // Once the words of the reply show, they are the sign that Zaki is writing.
        ListHeaderComponent={typing && !offline && !writing ? <TypingIndicator /> : undefined}
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
          {suggestion ? (
            <View style={styles.suggest}>
              <ZakiAvatar size={28} />
              <Text variant="small" style={styles.flexText}>
                {fill(t.trackers.suggest, { name: suggestion })}
              </Text>
              <Button
                label={t.trackers.suggestAction}
                size="sm"
                icon="add"
                onPress={() => {
                  const name = suggestion;
                  track("tracker_suggest_tapped");
                  setSuggestion(null);
                  router.push({ pathname: "/tracker/new", params: { name } });
                }}
              />
              <IconButton name="close" label={t.ui.cancel} onPress={() => setSuggestion(null)} size={32} />
            </View>
          ) : null}
          {/* A new chat gets starters made for a busy household; later, the usual quick replies. */}
          <QuickReplies
            options={fresh ? t.chat.starters : t.chat.quickReplies}
            onPick={(text) => {
              const index = (fresh ? t.chat.starters : t.chat.quickReplies).indexOf(text);
              track(fresh ? "starter_tapped" : "quick_reply", { index });
              say(text);
            }}
          />
          <ChatInput onSend={say} />
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.bg },
  header: { flexDirection: "row", alignItems: "center", gap: space.sm + 2 },
  streak: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: space.sm + 2, paddingVertical: 4, marginEnd: space.md, borderRadius: radius.pill, backgroundColor: palette.surfaceStrong, borderWidth: 1, borderColor: palette.glassEdge },
  headerName: { lineHeight: 22 },
  list: { paddingHorizontal: space.md, paddingVertical: space.sm },
  suggest: { flexDirection: "row", alignItems: "center", gap: space.sm, marginHorizontal: space.md, marginBottom: space.xs, padding: space.sm, borderRadius: 18, ...glass },
  flexText: { flex: 1 },
  offline: { paddingHorizontal: space.md, paddingTop: space.xs },
  lock: { padding: space.lg, gap: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line, backgroundColor: palette.surface },
});
