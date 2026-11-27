import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, useNavigation } from "expo-router";
import type { CircleTask, DaftarEntry, HouseList, Item, ListTrackersResponse, Split, Tracker } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { listUpcoming } from "@/db/items";
import { t, dateLocale, listComma } from "@/i18n";
import { PLACE_ICON, preview, sortLists } from "@/lists/logic";
import { listDaftar, listLists, listSplits, listTasks, listTrackers, peekDaftar, peekLists, peekSplits, peekTasks, peekTrackers } from "@/lib/api";
import { comingUp } from "@/lib/coming-up";
import { useLive } from "@/lib/live";
import { useItems } from "@/lib/useItems";
import { NeedRow } from "@/today/NeedRow";
import { needsYou } from "@/today/needs";
import { PlanRow } from "@/today/PlanRow";
import { needsChanged, needWords } from "@/today/useNeeds";
import { canAdd } from "@/trackers/logic";
import { TrackerRow } from "@/trackers/TrackerRow";
import { Badge, Card, IconTile, IntroPanel, NavRow, palette, RowGroup, Screen, SectionHeader, space, Text, useAddSheet, type AddAction } from "@/ui";

/** How many lists with something open Today shows before "See all". */
const MAX_LISTS = 3;

/**
 * "What needs me?": what waits for an answer, the plans, the lists with something open, what is
 * tracked, and a quiet door to A space for you. The friend never sends this as a list unprompted.
 */
export default function TodayScreen() {
  // Plans come from SQLite a moment after the first draw: until then "nothing planned" is not known.
  const [plansRead, setPlansRead] = useState(false);
  const loadPlans = useCallback(async () => {
    const rows = await listUpcoming();
    setPlansRead(true);
    return rows;
  }, []);
  const { items, refresh, complete } = useItems(loadPlans);

  const [tasks, setTasks] = useState<CircleTask[] | null>(() => peekTasks());
  const [daftar, setDaftar] = useState<DaftarEntry[] | null>(() => peekDaftar());
  const [splits, setSplits] = useState<Split[] | null>(() => peekSplits());
  const [trackers, setTrackers] = useState<Tracker[] | null>(() => peekTrackers()?.trackers ?? null);
  const [limit, setLimit] = useState<number | null>(() => peekTrackers()?.limit ?? 1);
  // null until this server has answered GET /lists once (a server from before lists says 404: no section).
  const [lists, setLists] = useState<HouseList[] | null>(() => peekLists());

  /** What the phone holds (the same objects when nothing changed: no redraw). No request. */
  const readSaved = useCallback(() => {
    const held = { tasks: peekTasks(), daftar: peekDaftar(), splits: peekSplits(), trackers: peekTrackers(), lists: peekLists() };
    if (held.tasks) setTasks(held.tasks);
    if (held.daftar) setDaftar(held.daftar);
    if (held.splits) setSplits(held.splits);
    if (held.trackers) {
      setTrackers(held.trackers.trackers);
      setLimit(held.trackers.limit);
    }
    if (held.lists) setLists(held.lists);
  }, []);
  const loadOnline = useCallback(() => {
    readSaved();
    const showTrackers = (r: ListTrackersResponse) => {
      setTrackers(r.trackers);
      setLimit(r.limit);
    };
    const quiet = () => {};
    listTasks().then(setTasks).catch(quiet);
    listDaftar().then(setDaftar).catch(quiet);
    listSplits().then(setSplits).catch(quiet);
    listTrackers().then(showTrackers).catch(quiet);
    listLists().then(setLists).catch(quiet);
  }, [readSaved]);
  useLive(loadOnline);
  const reload = () => {
    loadOnline();
    return refresh();
  };
  // A row's answer is already in the saved copies: draw from them, and tell the tab's badge.
  const answered = () => {
    readSaved();
    needsChanged.emit();
  };

  const needs = useMemo(() => needsYou({ tasks, daftar, splits }, needWords()), [tasks, daftar, splits]);
  const { soon, repeating } = comingUp(items, new Date());
  const noPlans = soon.length === 0 && repeating.length === 0;
  const openLists = lists ? sortLists(lists).filter((l) => l.open_count > 0) : [];
  const own = (trackers ?? []).filter((x) => !x.pack).length;
  const replace = (next: Tracker) => setTrackers((all) => (all ?? []).map((x) => (x.id === next.id ? next : x)));
  const remind = () => router.navigate({ pathname: "/", params: { compose: "remind" } });

  const actions: AddAction[] = [
    { key: "remind", icon: "notifications-outline", kind: "alarm", label: t.lay.today.addRemind, onPress: remind },
    // A server from before lists has none to make.
    ...(lists === null ? [] : [{ key: "list", icon: "cart-outline", label: t.lay.today.addList, onPress: () => router.push({ pathname: "/list", params: { new: "1" } }) } satisfies AddAction]),
    // At the free limit the row says so before it is tapped: it opens Zaki Pro, not the form.
    canAdd(own, limit)
      ? { key: "tracker", icon: "stats-chart-outline", kind: "people", label: t.lay.today.addTracker, onPress: () => router.push("/tracker/new") }
      : { key: "tracker", icon: "sparkles", label: t.lay.today.addTracker, hint: t.trackers.addPro, onPress: () => router.push("/paywall") },
  ];
  const add = useAddSheet(actions);
  const navigation = useNavigation();
  useLayoutEffect(() => navigation.setOptions(add.header), [navigation, add.header]);

  const done = (i: Item) => () => void complete(i.id).catch(() => {});
  const dateLine = new Date().toLocaleDateString(dateLocale, { weekday: "long", day: "numeric", month: "long" });

  return (
    <Screen onRefresh={reload}>
      <Text variant="caption" color={palette.inkSoft} style={styles.date}>
        {dateLine}
      </Text>

      {needs.length ? (
        <>
          <SectionHeader title={fill(t.lay.today.needsCount, { n: needs.length })} />
          {needs.map((need) => (
            <NeedRow key={`${need.kind}:${need.id}`} need={need} onAnswered={answered} />
          ))}
        </>
      ) : null}

      {!plansRead ? null : noPlans && needs.length === 0 ? (
        <IntroPanel title={t.lay.today.emptyTitle} action={t.lay.today.emptyAction} onAction={remind} say={t.lay.today.emptySay} />
      ) : (
        <>
          <SectionHeader title={t.lay.common.plans} action={t.lay.common.seeAll} onAction={() => router.push("/upcoming")} />
          {noPlans ? (
            <Text variant="small" color={palette.inkSoft}>
              {t.lay.today.noPlans}
            </Text>
          ) : null}
          {soon.map((i) => (
            <PlanRow key={i.id} item={i} onDone={done(i)} />
          ))}
          {/* Repeating plans follow the dated ones under the same title (a row says when it rings). */}
          {repeating.map((i) => (
            <PlanRow key={i.id} item={i} onDone={done(i)} />
          ))}
        </>
      )}

      {openLists.length ? (
        <>
          <SectionHeader title={t.lists.title} action={t.lay.common.seeAll} onAction={() => router.push("/list")} />
          {openLists.slice(0, MAX_LISTS).map((l) => (
            <Card key={l.id} onPress={() => router.push({ pathname: "/list/[id]", params: { id: l.id } })} accessibilityLabel={l.name}>
              <View style={styles.listRow}>
                <IconTile name={PLACE_ICON[l.place]} size={36} />
                <View style={styles.flex}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {l.name}
                  </Text>
                  <Text variant="small" color={palette.inkSoft} numberOfLines={1}>
                    {preview(l, listComma)}
                  </Text>
                </View>
                <Badge label={fill(t.lists.count, { n: l.open_count })} tone="primary" />
              </View>
            </Card>
          ))}
        </>
      ) : null}

      {trackers?.length ? (
        <>
          <SectionHeader title={t.ui.tracking} action={t.lay.common.seeAll} onAction={() => router.push("/trackers")} />
          {trackers.map((tr) => (
            <TrackerRow key={tr.id} tracker={tr} onChanged={replace} />
          ))}
        </>
      ) : null}

      <View style={styles.last}>
        <RowGroup>
          <NavRow icon="leaf-outline" kind="alarm" title={t.lay.common.spaceForYou} onPress={() => router.push("/session")} />
        </RowGroup>
      </View>
      {add.sheet}
    </Screen>
  );
}

const styles = StyleSheet.create({
  date: { paddingHorizontal: space.xs },
  listRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  flex: { flex: 1, minWidth: 0 },
  last: { marginTop: space.md },
});
