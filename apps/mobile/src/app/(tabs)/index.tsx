import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Pressable, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useNetworkState } from "expo-network";
import { ChatInput, type ChatInputHandle } from "@/chat/ChatInput";
import { dayLabel, opensDay } from "@/chat/days";
import { createEntrance } from "@/chat/entrance";
import { quickReplies } from "@/chat/plus";
import { MessageBubble } from "@/chat/MessageBubble";
import { QuickReplies } from "@/chat/QuickReplies";
import { TypingIndicator } from "@/chat/TypingIndicator";
import { isWriting } from "@/chat/writing";
import { useChat } from "@/chat/useChat";
import type { LocalMessage } from "@/db/messages";
import { dateLocale, t } from "@/i18n";
import { track } from "@/lib/analytics";
import { getMe } from "@/lib/api";
import { unlock } from "@/lib/unlock-store";
import { useStreak } from "@/lib/streak-store";
import { shareInvite } from "@/referral/share";
import { shareStreakCard } from "@/share/card";
import { fill } from "@/circles/logic";
import { suggestTracker } from "@/trackers/logic";
import { Appear, Button, glass, Icon, IconButton, Note, palette, radius, shadow, space, Text, ZakiAvatar } from "@/ui";

/** How far up into older messages before the way back to the newest one is offered. */
const JUMP_AFTER = 480;
const DAY_WORDS = { today: t.chat.dayToday, yesterday: t.chat.dayYesterday };

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
        {typing ? (
          <Text variant="caption" color={palette.primaryInk}>
            {t.ui.zakiTyping}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export default function ChatScreen() {
  const { messages, loaded, typing, locked, send, writing } = useChat();
  // "عايز أتعود على القراية كل يوم" → offer a tracker with one tap (rules on the phone, no AI call).
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const list = useRef<FlatList<LocalMessage>>(null);
  // The list is inverted: offset 0 is the newest message.
  const toLatest = useCallback(() => list.current?.scrollToOffset({ offset: 0, animated: true }), []);
  // Reading older messages: a button offers the way back down.
  const [away, setAway] = useState(false);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const far = e.nativeEvent.contentOffset.y > JUMP_AFTER;
    setAway((was) => (was === far ? was : far));
  }, []);
  const say = (text: string) => {
    const followUp = unlock.onUserMessage(text);
    setSuggestion(suggestTracker(text));
    // Sent while reading older messages: back to where the new one lands.
    toLatest();
    void send(text).then(followUp).catch(() => {});
  };
  const navigation = useNavigation();
  // Today's "+" sends her here to say a reminder: the starter goes in the box, once per arrival.
  const composer = useRef<ChatInputHandle>(null);
  const { compose } = useLocalSearchParams<{ compose?: string }>();
  const composeWait = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (compose !== "remind") return;
    // The word is used up, so the next arrival with it starts again.
    router.setParams({ compose: undefined });
    // After the tab has taken the screen, or the keyboard does not come up.
    if (composeWait.current) clearTimeout(composeWait.current);
    composeWait.current = setTimeout(() => composer.current?.startReminder(), 80);
  }, [compose]);
  useEffect(() => () => void (composeWait.current && clearTimeout(composeWait.current)), []);
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
  // A new chat gets starters made for a busy household; later, two quick replies (what the "+" starts is not repeated).
  const chips = useMemo(() => (fresh ? t.chat.starters : quickReplies(t.chat.quickReplies, t.lay.chat.inPlus)), [fresh]);
  // Inverted list: newest at the bottom, keyboard-friendly.
  const data = useMemo(() => {
    const all = loaded && messages.length === 0 ? [GREETING] : messages;
    return [...all].reverse();
  }, [messages, loaded]);
  // Messages that arrive while the chat is open rise into place; the ones in the first list are
  // simply there (chat/entrance.ts). The list is handed over here, while the screen is drawn and
  // not in an effect: each bubble asks whether it arrives when it is first drawn.
  const entrance = useRef(createEntrance()).current;
  const listed = useRef<LocalMessage[] | null>(null);
  if (loaded && listed.current !== data) {
    listed.current = data;
    entrance.list(data.map((m) => m.client_id));
  }
  const now = new Date();

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
      <View style={styles.flex}>
        <FlatList
          ref={list}
          style={styles.flex}
          contentContainerStyle={styles.list}
          data={data}
          inverted
          keyExtractor={(m) => m.client_id}
          renderItem={({ item, index }) => {
            // In the inverted list, index-1 sits just below on screen and index+1 just above.
            const below = data[index - 1];
            const above = data[index + 1];
            const newDay = opensDay(item.created_at, above?.created_at);
            return (
              <MessageBubble
                message={item}
                // A new day ends a run too, so the last bubble of the day before keeps its time.
                lastInRun={below?.role !== item.role || (below ? opensDay(below.created_at, item.created_at) : false)}
                firstInRun={newDay || above?.role !== item.role}
                writing={isWriting(item, writing)}
                heard={writing?.clientId === item.client_id}
                day={newDay ? dayLabel(item.created_at, now, DAY_WORDS, dateLocale) : null}
                entrance={entrance}
              />
            );
          }}
          // Rows also depend on the reply being written (its dots, "Sending…" on the message it answers).
          extraData={writing}
          // Once the words of the reply show, they are the sign that Zaki is writing.
          ListHeaderComponent={typing && !offline && !writing ? <TypingIndicator /> : undefined}
          keyboardShouldPersistTaps="handled"
          onScroll={onScroll}
          scrollEventThrottle={64}
        />
        {away ? (
          <View style={styles.jumpWrap} pointerEvents="box-none">
            <Appear rise={6} ms={160}>
              <Pressable onPress={toLatest} accessibilityRole="button" accessibilityLabel={t.chat.jumpLatest} hitSlop={8} style={({ pressed }) => [styles.jump, pressed && styles.jumpPressed]}>
                <Icon name="chevron-down" size={22} color={palette.primaryInk} />
              </Pressable>
            </Appear>
          </View>
        ) : null}
      </View>
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
          <QuickReplies
            options={chips}
            onPick={(text) => {
              const index = chips.indexOf(text);
              track(fresh ? "starter_tapped" : "quick_reply", { index });
              say(text);
            }}
          />
          <ChatInput ref={composer} onSend={say} />
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
  // Over the bottom corner of the list, on the far side from Zaki's face (flips in RTL).
  jumpWrap: { position: "absolute", left: 0, right: 0, bottom: space.sm, paddingHorizontal: space.md, alignItems: "flex-end" },
  jump: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", ...glass, backgroundColor: palette.surfaceStrong, ...shadow.raised },
  jumpPressed: { opacity: 0.8 },
  suggest: { flexDirection: "row", alignItems: "center", gap: space.sm, marginHorizontal: space.md, marginBottom: space.xs, padding: space.sm, borderRadius: 18, ...glass },
  flexText: { flex: 1 },
  offline: { paddingHorizontal: space.md, paddingTop: space.xs },
  lock: { padding: space.lg, gap: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line, backgroundColor: palette.surface },
});
