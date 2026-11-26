import { useCallback, useMemo, useState } from "react";
import { useLive } from "@/lib/live";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import type { CircleTask, Item, ListTrackersResponse, Tracker } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { PlanRow } from "@/components/PlanRow";
import { listUpcoming } from "@/db/items";
import { t, dateLocale } from "@/i18n";
import { getMe, listTasks, listTrackers, peekMe, peekTasks, peekTrackers } from "@/lib/api";
import { useItems } from "@/lib/useItems";
import { TaskCard } from "@/tasks/TaskCard";
import { canAdd } from "@/trackers/logic";
import { comingUp } from "@/lib/coming-up";
import { TrackerCard } from "@/trackers/TrackerCard";
import { Button, Card, EmptyState, Icon, palette, radius, Screen, SectionHeader, space, Text, ZakiAvatar } from "@/ui";

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? t.ui.morning : h < 18 ? t.ui.afternoon : t.ui.evening;
};

/**
 * The Personal space in one screen: what's coming up, requests waiting for you, what you
 * track, and a quiet door to Session. The friend never sends this as a list unprompted.
 */
export default function TodayScreen() {
  const { items, refresh, complete } = useItems(listUpcoming);
  const [name, setName] = useState<string | null>(() => peekMe()?.name ?? null);
  const [tasks, setTasks] = useState<CircleTask[]>(() => peekTasks() ?? []);
  const asked = useMemo(() => tasks.filter((task) => task.status === "pending" && task.role === "assignee"), [tasks]);
  const [trackers, setTrackers] = useState<Tracker[] | null>(() => peekTrackers()?.trackers ?? null);
  const [limit, setLimit] = useState<number | null>(() => peekTrackers()?.limit ?? 1);

  const loadOnline = useCallback(() => {
    const showTrackers = (r: ListTrackersResponse) => {
      setTrackers(r.trackers);
      setLimit(r.limit);
    };
    // What the phone holds first (the same objects when nothing changed: no redraw), then the server.
    const held = { me: peekMe(), tasks: peekTasks(), trackers: peekTrackers() };
    if (held.me) setName(held.me.name);
    if (held.tasks) setTasks(held.tasks);
    if (held.trackers) showTrackers(held.trackers);
    getMe()
      .then((u) => setName(u.name))
      .catch(() => {});
    listTasks()
      .then(setTasks)
      .catch(() => {});
    listTrackers()
      .then(showTrackers)
      .catch(() => {});
  }, []);
  useLive(loadOnline);
  const reload = () => {
    loadOnline();
    return refresh();
  };

  const { soon, repeating, more } = comingUp(items);
  const own = (trackers ?? []).filter((x) => !x.pack).length;
  const replace = (next: Tracker) => setTrackers((all) => (all ?? []).map((x) => (x.id === next.id ? next : x)));
  const dateLine = new Date().toLocaleDateString(dateLocale, { weekday: "long", day: "numeric", month: "long" });

  return (
    <Screen onRefresh={reload}>
      <View style={styles.hero}>
        <ZakiAvatar size={52} glow />
        <View style={styles.flex}>
          <Text variant="caption" color={palette.inkSoft}>
            {dateLine}
          </Text>
          <Text variant="title">{name ? fill(t.ui.hello, { greeting: greeting(), name }) : fill(t.ui.helloAnon, { greeting: greeting() })}</Text>
          <Text variant="small" color={palette.inkSoft}>
            {t.ui.todayLine}
          </Text>
        </View>
      </View>

      {asked.length ? (
        <>
          <SectionHeader title={t.ui.askedOfYou} />
          {asked.map((task) => (
            <TaskCard key={task.id} task={task} showCircle onChanged={reload} />
          ))}
        </>
      ) : null}

      <SectionHeader title={t.ui.comingUp} action={more > 0 ? fill("{n} +", { n: more }) : undefined} onAction={() => router.push("/upcoming")} />
      {soon.length === 0 && repeating.length === 0 ? (
        <Card>
          <EmptyState title={t.ui.noPlansTitle} body={t.ui.noPlansBody} action={<Button label={t.ui.tabZaki} kind="tonal" size="sm" icon="chatbubble-ellipses-outline" onPress={() => router.navigate("/")} />} />
        </Card>
      ) : (
        soon.map((i: Item) => <PlanRow key={i.id} item={i} onDone={() => void complete(i.id).catch(() => {})} />)
      )}
      {repeating.length ? (
        <>
          <SectionHeader title={t.ui.repeating} />
          {repeating.map((i: Item) => (
            <PlanRow key={i.id} item={i} onDone={() => void complete(i.id).catch(() => {})} />
          ))}
        </>
      ) : null}

      <SectionHeader title={t.ui.tracking} action={canAdd(own, limit) ? t.trackers.add.replace(/^\+\s*/, "") : t.trackers.addPro} onAction={() => router.push(canAdd(own, limit) ? "/tracker/new" : "/paywall")} />
      {trackers?.map((tr) => <TrackerCard key={tr.id} tracker={tr} onChanged={replace} onRemoved={loadOnline} />)}
      {trackers && trackers.length === 0 ? (
        <Card>
          <EmptyState title={t.trackers.empty} action={<Button label={t.trackers.add} kind="tonal" size="sm" icon="add" onPress={() => router.push("/tracker/new")} />} />
        </Card>
      ) : null}
      {trackers?.length ? (
        <Text variant="caption" color={palette.inkSoft} align="center">
          {t.trackers.chatHint}
        </Text>
      ) : null}

      <Card onPress={() => router.push("/session")} tone={palette.calmSoft} style={styles.reflect} accessibilityLabel={t.ui.reflectTitle}>
        <View style={styles.reflectIcon}>
          <Icon name="leaf" size={22} color={palette.calm} />
        </View>
        <View style={styles.flex}>
          <Text variant="headline" color={palette.calm}>
            {t.ui.reflectTitle}
          </Text>
          <Text variant="small" color={palette.inkSoft}>
            {t.ui.reflectBody}
          </Text>
        </View>
        <Icon name="chevron-forward" size={18} color={palette.calm} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  hero: { flexDirection: "row", alignItems: "center", gap: space.lg, paddingVertical: space.sm },
  reflect: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.md },
  reflectIcon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: palette.surface, alignItems: "center", justifyContent: "center" },
});
