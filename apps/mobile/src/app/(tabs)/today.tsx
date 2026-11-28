import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router, useNavigation, type Href } from "expo-router";
import type { CareMed, CircleTask, DaftarEntry, Gameya, HouseList, Item, ListTrackersResponse, Split, Tracker } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { listUpcoming } from "@/db/items";
import { t, dateLocale, language, listComma } from "@/i18n";
import { prefs } from "@/lib/prefs";
import { localDayOf } from "@/lib/unlock";
import { holidayNote } from "@/today/holiday";
import { listCare, listDaftar, listGameyas, listLists, listSplits, listTasks, listTrackers, peekCare, peekDaftar, peekGameyas, peekLists, peekSplits, peekTasks, peekTrackers } from "@/lib/api";
import { localDay } from "@/gameya/logic";
import { doseClock } from "@/care/clock";
import { useLive } from "@/lib/live";
import { useItems } from "@/lib/useItems";
import { NeedRow } from "@/today/NeedRow";
import { glancePlans, nextLine, rankNeeds, shown, type GlanceFilter } from "@/today/glance";
import { needsYou } from "@/today/needs";
import { PlanRow } from "@/today/PlanRow";
import { needsChanged, needWords } from "@/today/useNeeds";
import { canAdd } from "@/trackers/logic";
import { Icon, IntroPanel, MiniTile, MiniTiles, MoreRow, notify, NumberStrip, palette, Rows, Screen, SectionHeader, space, Text, useAddSheet, type AddAction, type StripCell } from "@/ui";

/**
 * "What needs me?" at a glance: the date and what comes next, three numbers (tap one to see only
 * that), the inbox capped at four, the plans, and three small doors (lists, tracking, A space for
 * you). The friend never sends this as a list unprompted.
 */
export default function TodayScreen() {
  // Plans come from SQLite a moment after the first draw: until then "nothing planned" is not known.
  const [plansRead, setPlansRead] = useState(false);
  const loadPlans = useCallback(async () => {
    const rows = await listUpcoming();
    setPlansRead(true);
    return rows;
  }, []);
  const { items, refresh, complete, reopen } = useItems(loadPlans);
  const [filter, setFilter] = useState<GlanceFilter | null>(null);
  const [allNeeds, setAllNeeds] = useState(false);

  const [tasks, setTasks] = useState<CircleTask[] | null>(() => peekTasks());
  const [daftar, setDaftar] = useState<DaftarEntry[] | null>(() => peekDaftar());
  const [splits, setSplits] = useState<Split[] | null>(() => peekSplits());
  const [gameyas, setGameyas] = useState<Gameya[] | null>(() => peekGameyas());
  const [trackers, setTrackers] = useState<Tracker[] | null>(() => peekTrackers()?.trackers ?? null);
  const [limit, setLimit] = useState<number | null>(() => peekTrackers()?.limit ?? 1);
  // null until this server has answered GET /lists once (a server from before lists says 404: no section).
  const [lists, setLists] = useState<HouseList[] | null>(() => peekLists());
  const [care, setCare] = useState<CareMed[] | null>(() => peekCare());

  /** What the phone holds (the same objects when nothing changed: no redraw). No request. */
  const readSaved = useCallback(() => {
    const held = { tasks: peekTasks(), daftar: peekDaftar(), splits: peekSplits(), trackers: peekTrackers(), lists: peekLists(), gameyas: peekGameyas(), care: peekCare() };
    if (held.gameyas) setGameyas(held.gameyas);
    if (held.care) setCare(held.care);
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
    listGameyas().then(setGameyas).catch(quiet);
    listCare().then(setCare).catch(quiet);
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

  const needs = useMemo(() => rankNeeds(needsYou({ tasks, daftar, splits, gameyas, care, today: localDay() }, needWords())), [tasks, daftar, splits, gameyas, care]);
  const now = new Date();
  const plans = glancePlans(items, now);
  const lateIds = new Set(plans.late.map((i) => i.id));
  // A filter whose number fell to 0 (the last late plan was ticked) shows everything again.
  const live = filter === "needs" ? needs.length : filter === "plans" ? plans.rows.length : filter === "late" ? plans.late.length : 0;
  const view = shown(live ? filter : null, needs, plans.rows, plans.late, allNeeds);
  useEffect(() => {
    if (filter && !live && plansRead) setFilter(null);
  }, [filter, live, plansRead]);
  const nothing = needs.length === 0 && plans.rows.length === 0;
  const openThings = (lists ?? []).reduce((n, l) => n + l.open_count, 0);
  const daily = (trackers ?? []).filter((x) => x.goal !== null && !x.cumulative);
  const met = daily.filter((x) => x.today >= (x.goal ?? 0)).length;
  const own = (trackers ?? []).filter((x) => !x.pack).length;
  const remind = () => router.navigate({ pathname: "/", params: { compose: "remind" } });
  const cells: StripCell<GlanceFilter>[] = [
    { key: "needs", value: needs.length, label: t.lay.common.needsYou },
    { key: "plans", value: plans.rows.length, label: t.lay.today.stripPlans },
    { key: "late", value: plans.late.length, label: t.lay.today.late, danger: true },
  ];

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

  // The row leaves at once; "Undo" brings the plan back as it was.
  const done = (i: Item) => () => {
    void complete(i.id).catch(() => {});
    notify(t.lay.today.planDone, "ok", { label: t.lay.common.undo, onPress: () => void reopen(i) });
  };
  const holiday = holidayNote(prefs.get("city"), localDayOf(now), language === "en" ? "en" : "ar");
  const next = nextLine({ care, gameyas }, { dose: t.lay.today.nextDose, turn: t.lay.today.gameyaTurn, clock: doseClock });
  const date = now.toLocaleDateString(dateLocale, { weekday: "long", day: "numeric", month: "long" });
  const holidayText = holiday ? (holiday.when === "today" ? holiday.name : fill(t.lay.today.tomorrowHoliday, { name: holiday.name })) : "";

  return (
    <Screen onRefresh={reload}>
      <View style={styles.top}>
        <Text variant="caption" color={palette.inkSoft}>
          {[date, next ? "" : holidayText].filter(Boolean).join(" · ")}
        </Text>
        {next ? (
          <Pressable onPress={() => router.push(next.route as Href)} accessibilityRole="button" accessibilityLabel={next.text} hitSlop={8} style={styles.next}>
            <Text variant="smallStrong" numberOfLines={1} style={styles.flex}>
              {next.text}
            </Text>
            <Icon name="chevron-forward" size={16} color={palette.inkFaint} />
          </Pressable>
        ) : null}
      </View>

      <NumberStrip cells={cells} selected={live ? filter : null} onSelect={setFilter} />

      {view.needs.length ? (
        <Rows>
          {view.needs.map((need) => (
            <NeedRow key={`${need.kind}:${need.id}`} need={need} onAnswered={answered} flat />
          ))}
          {view.moreNeeds > 0 ? <MoreRow label={fill(t.lay.today.more, { n: view.moreNeeds })} onPress={() => setAllNeeds(true)} /> : null}
        </Rows>
      ) : null}

      {!plansRead ? null : nothing ? (
        <IntroPanel title={t.lay.today.emptyTitle} action={t.lay.today.emptyAction} onAction={remind} say={t.lay.today.emptySay} />
      ) : filter && live && filter !== "plans" && filter !== "late" ? null : (
        <>
          <SectionHeader title={t.lay.common.plans} action={t.lay.common.seeAll} onAction={() => router.push("/upcoming")} />
          {view.plans.length === 0 ? (
            <Text variant="small" color={palette.inkSoft} style={styles.none}>
              {t.lay.today.noPlans}
            </Text>
          ) : (
            <Rows>
              {view.plans.map((i) => (
                <PlanRow key={i.id} item={i} onDone={done(i)} late={lateIds.has(i.id)} flat />
              ))}
              {view.morePlans > 0 ? <MoreRow label={fill(t.lay.today.more, { n: view.morePlans })} onPress={() => setFilter("plans")} /> : null}
            </Rows>
          )}
        </>
      )}

      {filter && live ? null : (
        <View style={styles.doors}>
          <MiniTiles>
            {lists === null ? null : <MiniTile icon="cart-outline" title={t.lists.title} line={openThings ? fill(t.lay.today.listsOpen, { n: openThings }) : undefined} onPress={() => router.push("/list")} />}
            <MiniTile icon="stats-chart-outline" kind="people" title={t.ui.tracking} line={daily.length ? fill(t.lay.today.trackingOf, { done: met, n: daily.length }) : undefined} onPress={() => router.push("/trackers")} />
            <MiniTile icon="leaf-outline" kind="alarm" title={t.lay.common.spaceForYou} onPress={() => router.push("/session")} />
          </MiniTiles>
        </View>
      )}
      {add.sheet}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: space.xs, gap: 2 },
  next: { flexDirection: "row", alignItems: "center", gap: space.xs, minHeight: 32 },
  flex: { flexShrink: 1, minWidth: 0 },
  none: { paddingHorizontal: space.xs },
  doors: { marginTop: space.sm },
});
