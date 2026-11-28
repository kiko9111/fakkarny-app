import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router, Stack, useLocalSearchParams, type Href } from "expo-router";
import { guessDose as guessDoseMark, checkinOrder, type CareMed, type CheckinKind, type CircleDetail, type CircleFeedResponse, type HouseList, type MoneySection, type PocketAccount, type SharedTracker, type Split } from "@fakkarni/shared";
import { careSummary } from "@/care/logic";
import { doseClock } from "@/care/clock";
import { fill, guessCheckin } from "@/circles/logic";
import { memberRows, type MemberRow, type MemberThing } from "@/circles/people";
import { listSummary, moneyTile, moreCheckins, pocketOwed, showsHomework, taskCounts } from "@/circles/summary";
import { ago, CircleWaiting, memberName, useCircle, useInvite } from "@/circles/useCircle";
import { dateLocale, t } from "@/i18n";
import { checkIn, markDose, respondTask, savedMed, getCircleFeed, getCircleTrackers, getMoney, getPocketMoney, listCare, listLists, listSplits, peekCircleFeed, peekCare, peekCircleTrackers, peekLists, peekMoney, peekPocketMoney, peekSplits, saveCircle } from "@/lib/api";
import { useLive } from "@/lib/live";
import { pullItems } from "@/sync/items";
import { dayOf } from "@/today/glance";
import { needsChanged } from "@/today/useNeeds";
import { QueuedOffline } from "@/sync/writes";
import { Button, Card, Chip, Icon, IconButton, MiniTile, MiniTiles, MoreRow, notify, palette, PersonAvatar, plain, Rows, Screen, SectionHeader, space, Text, ZakiAvatar, type IconName } from "@/ui";

const CHECKIN_ICON: Record<CheckinKind, IconName> = { arrived: "flag-outline", home: "home-outline", on_way: "car-outline", medicine: "medkit-outline", ok: "happy-outline" };
const LATEST = 2;
/** Three doors to a line. */
const PER_LINE = 3;
/** A check-in's time: today the clock alone, else the weekday too. */
const checkinTime = (iso: string) => (dayOf(iso, new Date()) === "today" ? new Date(iso).toLocaleTimeString(dateLocale, { hour: "numeric", minute: "2-digit" }) : ago(iso));
const ANSWER: Partial<Record<MemberThing["type"], () => string>> = { dose: () => t.lay.care.taken, request: () => t.lay.today.yes, review: () => t.lay.today.review };
const amount = (n: number) => Math.round(n).toLocaleString(dateLocale);

/**
 * One circle by person, in about one phone height: the check-in, a row per member (their last
 * check-in and the one open thing between you, answered in place), a small door per job, and the
 * two newest lines. Members, invite, leave and delete are on Circle info (the header's
 * button); the whole feed is behind "See all".
 */
export default function CircleScreen() {
  const { id, invite: inviteNow } = useLocalSearchParams<{ id: string; invite?: string }>();
  const { circle, setCircle, guessCircle, failed, showHeld, loadCircle } = useCircle(id);
  const [feed, setFeed] = useState<CircleFeedResponse>(() => peekCircleFeed(id) ?? { posts: [], tasks: [], link_tasks: [] });
  const [trackers, setTrackers] = useState<SharedTracker[]>(() => peekCircleTrackers(id) ?? []);
  // A server from before lists answers 404: the tile shows only once lists have loaded here.
  const [lists, setLists] = useState<HouseList[] | null>(() => peekLists());
  const [sections, setSections] = useState<MoneySection[] | null>(() => peekMoney()?.sections ?? null);
  const [pocket, setPocket] = useState<PocketAccount[] | null>(() => peekPocketMoney());
  const [splits, setSplits] = useState<Split[] | null>(() => peekSplits());
  // As with lists: a server from before care circles answers 404, and the tile stays hidden.
  const [care, setCare] = useState<CareMed[] | null>(() => peekCare());
  const [more, setMore] = useState(false);
  const [answering, setAnswering] = useState<string | null>(null);

  // Each part loads on its own: the circle shows as soon as it arrives, and a feed or tracker
  // problem never keeps the whole circle from opening.
  const load = useCallback(async () => {
    // What the phone holds first (the same objects when nothing changed: no redraw), then the server.
    showHeld();
    const held = { feed: peekCircleFeed(id), trackers: peekCircleTrackers(id), lists: peekLists(), money: peekMoney(), pocket: peekPocketMoney(), splits: peekSplits(), care: peekCare() };
    if (held.feed) setFeed(held.feed);
    if (held.trackers) setTrackers(held.trackers);
    if (held.lists) setLists(held.lists);
    if (held.money) setSections(held.money.sections);
    if (held.pocket) setPocket(held.pocket);
    if (held.splits) setSplits(held.splits);
    if (held.care) setCare(held.care);
    const feedDone = getCircleFeed(id).then(setFeed, () => {});
    const trackersDone = getCircleTrackers(id).then(setTrackers, () => {});
    void listLists().then(setLists, () => {});
    void getMoney().then(
      (o) => setSections(o.sections),
      () => {},
    );
    void getPocketMoney().then(setPocket, () => {});
    void listSplits().then(setSplits, () => {});
    void listCare().then(setCare, () => {});
    await loadCircle();
    await Promise.all([feedDone, trackersDone]);
  }, [id, showHeld, loadCircle]);

  // Reload on every return to the screen (after sending a request, for example).
  useLive(load);

  const { inviting, invite } = useInvite(id, () => void load());

  // Zaki's "Invite to …" card opens here with ?invite=1: go straight to the WhatsApp message, once.
  const autoInvited = useRef(false);
  useEffect(() => {
    if (inviteNow !== "1" || autoInvited.current || !circle) return;
    autoInvited.current = true;
    void invite();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteNow, circle]);

  const sendCheckin = (kind: CheckinKind) => {
    setMore(false);
    // The user's own row shows it at once; "sent" is said when the circle really has it.
    let guessed: CircleDetail | null = null;
    const next = (c: CircleDetail | null) => (guessed = c ? guessCheckin(c, kind, new Date()) : null);
    void guessCircle(() => checkIn(id, kind), { next, adopt: (answer) => answer, keep: (err) => err instanceof QueuedOffline }).then(
      (answer) => {
        setCircle(answer);
        notify(t.family.checkedIn);
        void load();
      },
      (err) => {
        // Offline: kept on the phone (and in the saved copy), sent to the family when the network is back.
        if (err instanceof QueuedOffline) {
          if (guessed) saveCircle(guessed);
          return notify(t.trackers.savedOffline, "info");
        }
        notify(t.circles.failed, "error");
      },
    );
  };

  if (!circle) return <CircleWaiting failed={failed} onRetry={() => void load()} />;

  const family = circle.kind === "family";
  const tint = family ? palette.family : palette.friends;
  const tintSoft = family ? palette.familySoft : palette.friendsSoft;
  const others = circle.members.length > 1;
  const open = (pathname: string) => () => router.push({ pathname, params: { id } } as Href);

  const counts = taskCounts(feed.tasks);
  const owed = pocketOwed(pocket, id);
  const list = listSummary(lists, id);
  const money = moneyTile(sections, splits, id);
  const meds = careSummary(care, id);
  const people = memberRows({ members: circle.members, tasks: feed.tasks, care, circleId: id }, { askedYou: t.lay.circle.askedYou, youAsked: t.lay.circle.youAsked, notMarked: t.lay.circle.medNotMarked, nextDose: t.lay.circle.medNext, clock: doseClock });

  /** Where a member's row goes: the screen of the thing beside them, else Circle info. */
  const thingRoute = (thing: MemberThing | null) => (!thing ? "/circle/info" : thing.type === "dose" || thing.type === "next" ? "/circle/care" : thing.type === "review" || (thing.type === "asked" && thing.homework) ? "/circle/homework" : "/circle/tasks");
  /** Taken and Yes answer in place; the row changes once the saved copies hold the answer. */
  const answerThing = async (row: MemberRow) => {
    const thing = row.thing;
    if (!thing || answering) return;
    if (thing.type !== "dose" && thing.type !== "request") return open(thingRoute(thing))();
    setAnswering(row.member.user_id);
    try {
      if (thing.type === "request") {
        await respondTask(thing.taskId, "accept");
        void pullItems();
      } else {
        const { medId, dueAt } = thing;
        try {
          await markDose(medId, { due_at: dueAt, status: "taken" });
          notify(t.lay.today.markedTaken, "ok", {
            label: t.lay.common.undo,
            onPress: () =>
              void markDose(medId, { due_at: dueAt, status: "open" }).then(
                () => void load(),
                () => notify(t.lay.care.failed, "error"),
              ),
          });
        } catch (err) {
          if (!(err instanceof QueuedOffline)) throw err;
          const med = peekCare()?.find((m) => m.id === medId);
          if (med) savedMed(guessDoseMark(med, dueAt, "taken", new Date(), null));
        }
      }
      needsChanged.emit();
      await load();
    } catch {
      notify(thing.type === "dose" ? t.lay.care.failed : t.tasks.failed, "error");
    } finally {
      setAnswering(null);
    }
  };

  const doors = [
    <MiniTile key="tasks" icon="checkmark-circle-outline" kind="people" title={t.lay.circle.tasks} line={counts.waiting ? fill(t.lay.circle.waiting, { n: counts.waiting }) : counts.open ? String(counts.open) : undefined} onPress={open("/circle/tasks")} />,
    showsHomework(family, feed.tasks) ? <MiniTile key="homework" icon="school-outline" title={t.lay.circle.homework} line={owed ? fill(t.ui.pounds, { n: amount(owed) }) : counts.homework ? String(counts.homework) : undefined} onPress={open("/circle/homework")} /> : null,
    lists ? <MiniTile key="lists" icon="cart-outline" title={t.lay.circle.lists} line={list.open ? fill(t.lay.today.listsOpen, { n: list.open }) : undefined} onPress={() => router.push({ pathname: "/list", params: { circle: id } })} /> : null,
    care && (meds.count > 0 || family) ? (
      <MiniTile
        key="care"
        icon="medkit-outline"
        kind="people"
        title={t.lay.care.title}
        line={meds.missed ? fill(t.lay.care.missedN, { n: meds.missed }) : meds.next ? fill(t.lay.care.nextAt, { time: doseClock(meds.next) }) : meds.count ? t.lay.care.allDone : undefined}
        danger={meds.missed > 0}
        onPress={open("/circle/care")}
      />
    ) : null,
    <MiniTile
      key="money"
      icon="wallet-outline"
      kind="money"
      title={t.lay.circle.money}
      line={money.value === null ? undefined : `${{ pay: t.lay.circle.toPay, share: t.lay.circle.yourShare, splits: t.lay.circle.openSplits, start: "" }[money.says]} ${money.says === "splits" ? String(money.value) : amount(money.value)}`.trim()}
      danger={money.says === "pay"}
      onPress={open("/circle/money")}
    />,
    <MiniTile key="trackers" icon="stats-chart-outline" kind="people" title={t.lay.circle.trackers} line={trackers.length ? String(trackers.length) : undefined} onPress={open("/circle/trackers")} />,
  ].filter((d): d is NonNullable<typeof d> => d !== null);
  const doorLines: (typeof doors)[] = [];
  for (let i = 0; i < doors.length; i += PER_LINE) doorLines.push(doors.slice(i, i + PER_LINE));

  const checkinChips = (
    <View style={styles.chips}>
      {(others ? moreCheckins(checkinOrder(circle.family_type)) : checkinOrder(circle.family_type)).map((kind) => (
        <Chip key={kind} label={plain(t.family.checkins[kind])} icon={CHECKIN_ICON[kind]} tone="family" onPress={() => sendCheckin(kind)} />
      ))}
    </View>
  );
  const posts = feed.posts.slice(0, LATEST);

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: circle.name,
          headerRight: () => <IconButton name="information-circle-outline" label={t.lay.circle.infoTitle} color={palette.primaryInk} onPress={open("/circle/info")} />,
        }}
      />

      {others ? (
        <>
          <View style={styles.actions}>
            <View style={styles.flex}>
              <Button label={plain(t.family.checkins.ok)} icon={CHECKIN_ICON.ok} block onPress={() => sendCheckin("ok")} />
            </View>
            <Button label={t.lay.circle.more} kind="text" onPress={() => setMore((m) => !m)} />
          </View>
          {more ? checkinChips : null}
          <Rows>
            {people.rows.map((row) => {
              const { member: m, thing } = row;
              const label = thing ? ANSWER[thing.type]?.() : undefined;
              const checkin = m.last_checkin ? `${plain(t.family.checkins[m.last_checkin.kind])} · ${checkinTime(m.last_checkin.at)}` : null;
              const busy = answering === m.user_id;
              return (
                <Pressable
                  key={m.user_id}
                  onPress={open(thingRoute(thing))}
                  accessibilityRole="button"
                  accessibilityLabel={[memberName(m), checkin, thing?.text].filter(Boolean).join(", ")}
                  style={({ pressed }) => [styles.person, pressed && styles.pressed]}
                >
                  <PersonAvatar name={memberName(m)} size={36} color={tint} bg={tintSoft} />
                  <View style={styles.flex}>
                    <View style={styles.nameLine}>
                      <Text variant="bodyStrong" numberOfLines={1} style={styles.name}>
                        {memberName(m)}
                      </Text>
                      {checkin ? (
                        <Text variant="caption" color={palette.inkSoft} numberOfLines={1} style={styles.checkin}>
                          {checkin}
                        </Text>
                      ) : null}
                    </View>
                    {thing ? (
                      <Text variant="small" color={thing.type === "dose" ? palette.danger : palette.inkSoft} numberOfLines={1}>
                        {thing.text}
                      </Text>
                    ) : null}
                  </View>
                  {label ? (
                    <Button label={label} size="sm" kind="tonal" busy={busy} disabled={busy} onPress={() => void answerThing(row)} accessibilityLabel={`${label}: ${thing?.text ?? ""}`} />
                  ) : (
                    <Icon name="chevron-forward" size={18} color={palette.inkFaint} />
                  )}
                </Pressable>
              );
            })}
            {people.more > 0 ? <MoreRow label={fill(t.lay.circle.moreMembers, { n: people.more })} onPress={open("/circle/info")} /> : null}
          </Rows>
        </>
      ) : (
        <Card style={styles.top}>
          <Text variant="headline">{t.lay.circle.inviteFirst}</Text>
          <Button label={t.circles.invite} kind="whatsapp" icon="logo-whatsapp" busy={inviting} block onPress={() => void invite()} />
          {/* A check-in made before the others join is what they see first. */}
          {checkinChips}
        </Card>
      )}

      <View style={styles.doors}>
        {doorLines.map((line, i) => (
          <MiniTiles key={i}>{line}</MiniTiles>
        ))}
      </View>

      <SectionHeader title={t.lay.circle.latest} action={t.lay.common.seeAll} onAction={open("/circle/feed")} />
      <Card style={styles.latest}>
        {posts.length === 0 ? (
          <Text variant="small" color={palette.inkSoft} style={styles.empty}>
            {t.lay.common.nothingYet}
          </Text>
        ) : null}
        {posts.map((p, n) => (
          <Pressable key={p.id} onPress={open("/circle/feed")} accessibilityRole="button" accessibilityLabel={p.text} style={[styles.post, n > 0 && styles.postLine]}>
            <ZakiAvatar size={24} />
            <Text variant="small" numberOfLines={2} style={styles.flex}>
              {p.text}
            </Text>
            <Text variant="caption" color={palette.inkFaint}>
              {ago(p.created_at)}
            </Text>
          </Pressable>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  top: { gap: space.md },
  person: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm, minHeight: 60 },
  pressed: { backgroundColor: palette.wash },
  nameLine: { flexDirection: "row", alignItems: "baseline", gap: space.sm },
  name: { flexShrink: 1 },
  checkin: { flexShrink: 0 },
  doors: { gap: space.sm },
  actions: { flexDirection: "row", alignItems: "center", gap: space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  latest: { paddingVertical: space.xs, gap: 0 },
  empty: { paddingVertical: space.md },
  post: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 48, paddingVertical: space.sm },
  postLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line },
});
