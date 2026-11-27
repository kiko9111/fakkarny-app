import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router, Stack, useLocalSearchParams, type Href } from "expo-router";
import { checkinOrder, type CheckinKind, type CircleDetail, type CircleFeedResponse, type HouseList, type MoneySection, type PocketAccount, type SharedTracker } from "@fakkarni/shared";
import { fill, guessCheckin } from "@/circles/logic";
import { bookSummary, latestCheckin, listSummary, moreCheckins, pocketOwed, taskCounts } from "@/circles/summary";
import { ago, CircleWaiting, memberName, useCircle, useInvite } from "@/circles/useCircle";
import { dateLocale, t } from "@/i18n";
import { checkIn, getCircleFeed, getCircleTrackers, getMoney, getPocketMoney, listLists, peekCircleFeed, peekCircleTrackers, peekLists, peekMoney, peekPocketMoney, saveCircle } from "@/lib/api";
import { useLive } from "@/lib/live";
import { QueuedOffline } from "@/sync/writes";
import { Button, Card, Chip, IconButton, notify, palette, PersonAvatar, plain, Screen, SectionHeader, space, Text, Tile, TileGrid, ZakiAvatar, type IconName } from "@/ui";

const CHECKIN_ICON: Record<CheckinKind, IconName> = { arrived: "flag-outline", home: "home-outline", on_way: "car-outline", medicine: "medkit-outline", ok: "happy-outline" };
const LATEST = 2;
const FACES = 6;
const amount = (n: number) => Math.round(n).toLocaleString(dateLocale);

/**
 * One circle in about one phone height: who's OK, a tile per job (each opens its own screen),
 * and the two newest lines. Members, invite, leave and delete are on Circle info (the header's
 * button); the whole feed is behind "See all".
 */
export default function CircleScreen() {
  const { id, invite: inviteNow } = useLocalSearchParams<{ id: string; invite?: string }>();
  const { circle, setCircle, guessCircle, failed, showHeld, loadCircle } = useCircle(id);
  const [feed, setFeed] = useState<CircleFeedResponse>(() => peekCircleFeed(id) ?? { posts: [], tasks: [] });
  const [trackers, setTrackers] = useState<SharedTracker[]>(() => peekCircleTrackers(id) ?? []);
  // A server from before lists answers 404: the tile shows only once lists have loaded here.
  const [lists, setLists] = useState<HouseList[] | null>(() => peekLists());
  const [sections, setSections] = useState<MoneySection[] | null>(() => peekMoney()?.sections ?? null);
  const [pocket, setPocket] = useState<PocketAccount[] | null>(() => peekPocketMoney());
  const [more, setMore] = useState(false);

  // Each part loads on its own: the circle shows as soon as it arrives, and a feed or tracker
  // problem never keeps the whole circle from opening.
  const load = useCallback(async () => {
    // What the phone holds first (the same objects when nothing changed: no redraw), then the server.
    showHeld();
    const held = { feed: peekCircleFeed(id), trackers: peekCircleTrackers(id), lists: peekLists(), money: peekMoney(), pocket: peekPocketMoney() };
    if (held.feed) setFeed(held.feed);
    if (held.trackers) setTrackers(held.trackers);
    if (held.lists) setLists(held.lists);
    if (held.money) setSections(held.money.sections);
    if (held.pocket) setPocket(held.pocket);
    const feedDone = getCircleFeed(id).then(setFeed, () => {});
    const trackersDone = getCircleTrackers(id).then(setTrackers, () => {});
    void listLists().then(setLists, () => {});
    void getMoney().then(
      (o) => setSections(o.sections),
      () => {},
    );
    void getPocketMoney().then(setPocket, () => {});
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

  const last = latestCheckin(circle.members);
  const counts = taskCounts(feed.tasks);
  const owed = pocketOwed(pocket, id);
  const list = listSummary(lists, id);
  const books = bookSummary(sections, id);
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
        <Card style={styles.top}>
          <View style={styles.faces}>
            {circle.members.slice(0, FACES).map((m) => (
              <PersonAvatar key={m.user_id} name={memberName(m)} size={36} color={tint} bg={tintSoft} />
            ))}
            {circle.members.length > FACES ? (
              <Text variant="smallStrong" color={palette.inkSoft}>
                +{circle.members.length - FACES}
              </Text>
            ) : null}
          </View>
          <Text variant="small" color={palette.inkSoft} numberOfLines={2}>
            {last?.last_checkin
              ? `${fill(t.lay.circle.checkinLine, { name: memberName(last), what: plain(t.family.checkins[last.last_checkin.kind]) })} · ${ago(last.last_checkin.at)}`
              : t.lay.circle.noCheckins}
          </Text>
          <View style={styles.actions}>
            <View style={styles.flex}>
              <Button label={plain(t.family.checkins.ok)} icon={CHECKIN_ICON.ok} block onPress={() => sendCheckin("ok")} />
            </View>
            <Button label={t.lay.circle.more} kind="text" onPress={() => setMore((m) => !m)} />
          </View>
          {more ? (
            <View style={styles.chips}>
              {moreCheckins(checkinOrder(circle.family_type)).map((kind) => (
                <Chip key={kind} label={plain(t.family.checkins[kind])} icon={CHECKIN_ICON[kind]} tone="family" onPress={() => sendCheckin(kind)} />
              ))}
            </View>
          ) : null}
        </Card>
      ) : (
        <Card style={styles.top}>
          <Text variant="headline">{t.lay.circle.inviteFirst}</Text>
          <Button label={t.circles.invite} kind="whatsapp" icon="logo-whatsapp" busy={inviting} block onPress={() => void invite()} />
        </Card>
      )}

      <TileGrid>
        <Tile
          title={t.lay.circle.tasks}
          icon="checkmark-circle-outline"
          kind="people"
          value={String(counts.open)}
          line={counts.waiting ? fill(t.lay.circle.waiting, { n: counts.waiting }) : undefined}
          tone="primary"
          onPress={open("/circle/tasks")}
        />
        {family ? (
          <Tile
            title={t.lay.circle.homework}
            icon="school-outline"
            value={String(counts.homework)}
            line={owed ? fill(t.lay.circle.pocket, { n: amount(owed) }) : undefined}
            onPress={open("/circle/homework")}
          />
        ) : null}
        {lists ? (
          <Tile title={t.lay.circle.lists} icon="cart-outline" value={String(list.open)} line={list.top?.name} onPress={() => router.push({ pathname: "/list", params: { circle: id } })} />
        ) : null}
        <Tile
          title={t.lay.circle.money}
          icon="wallet-outline"
          kind="money"
          value={books.books ? amount(books.share) : undefined}
          line={books.books ? t.lay.circle.yourShare : t.lay.circle.startBook}
          onPress={open("/circle/money")}
        />
        <Tile
          title={t.lay.circle.trackers}
          icon="stats-chart-outline"
          kind="people"
          value={trackers.length ? String(trackers.length) : undefined}
          line={trackers.length ? undefined : t.lay.circle.startTracker}
          onPress={open("/circle/trackers")}
        />
      </TileGrid>

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
  faces: { flexDirection: "row", alignItems: "center", gap: space.xs },
  actions: { flexDirection: "row", alignItems: "center", gap: space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  latest: { paddingVertical: space.xs, gap: 0 },
  empty: { paddingVertical: space.md },
  post: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 48, paddingVertical: space.sm },
  postLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line },
});
