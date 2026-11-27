import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { isRamadanSeason, type CircleFeedResponse } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { AskZakiBox, FeedPost } from "@/circles/FeedPost";
import { trialDaysLeft } from "@/circles/summary";
import { CircleWaiting, useCircle } from "@/circles/useCircle";
import { t } from "@/i18n";
import { answerInvite, askZakiInCircle, getCircleFeed, getCircleSummary, inviteToIftar, peekCircleFeed } from "@/lib/api";
import { useLive } from "@/lib/live";
import { iftarDate, type IftarDay } from "@/tasks/logic";
import { ask, Badge, Button, Card, Chip, HeaderPlus, notify, palette, plain, Screen, space, Text, ZakiAvatar } from "@/ui";

/** Everything that happened in the circle: Zaki's week, the @Zaki box, then each line with its reactions and comments. */
export default function CircleFeedScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { circle, failed, showHeld, loadCircle } = useCircle(id);
  const [feed, setFeed] = useState<CircleFeedResponse>(() => peekCircleFeed(id) ?? { posts: [], tasks: [] });
  const [summary, setSummary] = useState<string[] | null>(null);

  const load = useCallback(async () => {
    showHeld();
    const held = peekCircleFeed(id);
    if (held) setFeed(held);
    const feedDone = getCircleFeed(id).then(setFeed, () => {});
    const summaryDone = getCircleSummary(id).then(
      (s) => setSummary(s.lines),
      () => setSummary(null),
    );
    await loadCircle();
    await Promise.all([feedDone, summaryDone]);
  }, [id, showHeld, loadCircle]);
  useLive(load);

  const act = async (work: () => Promise<void>, done?: string) => {
    try {
      await work();
      if (done) notify(done);
      void load();
    } catch {
      notify(t.circles.failed, "error");
      // Whatever the screen guessed meanwhile goes back to what the server has.
      void load();
    }
  };
  /** Going / not going shows on the invitation at once. */
  const rsvp = (postId: string, going: boolean) => {
    setFeed((f) => ({ ...f, posts: f.posts.map((p) => (p.id === postId ? { ...p, my_rsvp: going } : p)) }));
    void act(() => answerInvite(id, postId, going));
  };
  const iftar = (pick: IftarDay) => void act(() => inviteToIftar(id, iftarDate(pick, new Date())), t.ramadan.sent);
  const askIftarDay = () =>
    ask(t.ramadan.iftarWhen, undefined, [
      { label: t.ramadan.days.today, onPress: () => iftar("today") },
      { label: t.ramadan.days.tomorrow, onPress: () => iftar("tomorrow") },
      { label: t.ramadan.days.friday, onPress: () => iftar("friday") },
    ]);

  if (!circle) return <CircleWaiting failed={failed} onRetry={() => void load()} />;

  const canInvite = isRamadanSeason(new Date()) && circle.members.length > 1;
  const trialDays = trialDaysLeft(circle.trial_until, new Date());

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: t.lay.circle.latest,
          // In Ramadan the "+" invites the circle to iftar; nothing else is added from here.
          headerRight: canInvite ? () => <HeaderPlus label={plain(t.ramadan.iftar)} onPress={askIftarDay} /> : undefined,
        }}
      />

      {!circle.extras ? (
        <Card style={styles.week}>
          <View style={styles.weekHead}>
            <ZakiAvatar size={24} />
            <Text variant="small" color={palette.inkSoft} style={styles.flex}>
              {t.lay.circle.weekLocked}
            </Text>
          </View>
          <Button label={t.circles.seePro} kind="tonal" size="sm" onPress={() => router.push("/paywall")} style={styles.start} />
        </Card>
      ) : summary?.length ? (
        <Card style={styles.week}>
          <View style={styles.weekHead}>
            <ZakiAvatar size={24} />
            <Text variant="smallStrong" style={styles.flex}>
              {t.lay.circle.weekTitle}
            </Text>
            {trialDays > 0 ? <Badge label={fill(t.lay.circle.trialDays, { n: trialDays })} tone="primary" /> : null}
          </View>
          {summary.map((line) => (
            <Text key={line} variant="small">
              {line}
            </Text>
          ))}
        </Card>
      ) : null}

      <Card>
        <AskZakiBox
          onAsk={async (text) => {
            try {
              const post = await askZakiInCircle(id, text);
              setFeed((f) => ({ ...f, posts: [post, ...f.posts] }));
            } catch {
              notify(t.tasks.failed, "error");
            }
          }}
        />
      </Card>

      {feed.posts.length === 0 ? (
        <Text variant="small" color={palette.inkSoft} align="center">
          {t.lay.common.nothingYet}
        </Text>
      ) : null}
      {feed.posts.slice(0, 30).map((p) => (
        <FeedPost
          key={p.id}
          circleId={id}
          post={p}
          onChange={(next) => setFeed((f) => ({ ...f, posts: f.posts.map((x) => (x.id === next.id ? next : x)) }))}
          extra={
            p.kind === "iftar" ? (
              <View style={styles.chips}>
                <Chip label={plain(t.ramadan.going)} selected={p.my_rsvp === true} onPress={() => rsvp(p.id, true)} />
                <Chip label={plain(t.ramadan.notGoing)} selected={p.my_rsvp === false} onPress={() => rsvp(p.id, false)} />
              </View>
            ) : undefined
          }
        />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  week: { gap: space.xs },
  weekHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  start: { alignSelf: "flex-start" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
