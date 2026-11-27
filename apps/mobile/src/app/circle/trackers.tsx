import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import type { SharedTracker } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { t } from "@/i18n";
import { getCircleTrackers, peekCircleTrackers } from "@/lib/api";
import { useLive } from "@/lib/live";
import { TRACKER_ICON, trackerName, TrackerStreak } from "@/trackers/TrackerCard";
import { Card, IconTile, IntroPanel, LoadingCards, palette, Screen, space, Text, useAddSheet } from "@/ui";

/** The trackers this circle's people share with it: whose, today's count, the streak. "+" starts one. */
export default function CircleTrackersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [trackers, setTrackers] = useState<SharedTracker[] | null>(() => peekCircleTrackers(id));
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const held = peekCircleTrackers(id);
    if (held) setTrackers(held);
    try {
      setTrackers(await getCircleTrackers(id));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [id]);
  useLive(load);

  const add = useAddSheet([{ key: "tracker", icon: "stats-chart-outline", label: t.lay.circle.startTracker, onPress: () => router.push({ pathname: "/tracker/new", params: { circle: id } }) }]);

  return (
    <Screen>
      <Stack.Screen options={{ title: t.lay.circle.trackers, ...add.header }} />
      {trackers === null ? (
        failed ? (
          <IntroPanel title={t.circles.offline} action={t.lay.common.tryAgain} onAction={() => void load()} />
        ) : (
          <LoadingCards count={3} />
        )
      ) : trackers.length === 0 ? (
        <IntroPanel title={t.lay.circle.trackersEmpty} action={t.lay.circle.startTracker} onAction={add.open} />
      ) : (
        <Card style={styles.rows}>
          {trackers.map((tr, n) => (
            <View key={tr.id} style={[styles.row, n > 0 && styles.line]}>
              <IconTile name={TRACKER_ICON[tr.kind]} />
              <View style={styles.flex}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {trackerName(tr)}
                </Text>
                <Text variant="small" color={palette.inkSoft} numberOfLines={1}>
                  {[tr.is_mine ? t.trackers.mine : (tr.owner_name ?? t.circles.noName), tr.goal ? fill(t.trackers.ofGoalToday, { n: tr.today, goal: tr.goal }) : fill(t.trackers.today, { n: tr.today })].join(" · ")}
                </Text>
              </View>
              {tr.streak >= 2 ? <TrackerStreak days={tr.streak} /> : null}
            </View>
          ))}
        </Card>
      )}
      {add.sheet}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  rows: { paddingVertical: space.xs, gap: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line },
});
