import { useCallback, useEffect, useRef, useState } from "react";
import { useLive } from "@/lib/live";
import { QueuedOffline } from "@/sync/writes";
import { Linking, Share, StyleSheet, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import {
  checkinOrder,
  FamilyRole,
  isRamadanSeason,
  type CheckinKind,
  type CircleDetail,
  type CircleFeedResponse,
  type CircleMember,
  type SharedTracker,
  type HouseList,
} from "@fakkarni/shared";
import { fill, guessCheckin, whatsappShareUrl } from "@/circles/logic";
import { t, dateLocale } from "@/i18n";
import {
  answerInvite,
  askCheckin,
  askZakiInCircle,
  checkIn,
  inviteToIftar,
  createInvite,
  deleteCircle,
  getCircle,
  getCircleFeed,
  getCircleSummary,
  getCircleTrackers,
  listLists,
  peekLists,
  peekCircle,
  peekCircleFeed,
  peekCircleTrackers,
  removeCircleMember,
  saveCircle,
  screenCache,
  setFamilyRole,
} from "@/lib/api";
import { useGuess } from "@/lib/optimistic";
import { HttpError } from "@/sync/queue";
import { failText } from "@/lib/errors";
import { iftarDate, sortTasks, type IftarDay } from "@/tasks/logic";
import { TaskCard } from "@/tasks/TaskCard";
import { AskZakiBox, FeedPost } from "@/circles/FeedPost";
import {
  TrackerStreak,
  TRACKER_ICON,
  trackerName,
} from "@/trackers/TrackerCard";
import {
  glass,
  ask,
  Badge,
  Button,
  Card,
  Chip,
  confirm,
  Icon,
  IconButton,
  IconTile,
  LoadingCards,
  Note,
  notify,
  palette,
  PersonAvatar,
  plain,
  Screen,
  SectionHeader,
  space,
  Text,
  ZakiAvatar,
  type IconName,
} from "@/ui";

const CHECKIN_ICON: Record<CheckinKind, IconName> = {
  arrived: "flag-outline",
  home: "home-outline",
  on_way: "car-outline",
  medicine: "medkit-outline",
  ok: "happy-outline",
};
const ago = (iso: string) =>
  new Date(iso).toLocaleString(dateLocale, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });

/** One circle: who's OK, requests between its people, what Zaki posted, and the invite that grows it. */
export default function CircleScreen() {
  const { id, invite: inviteNow } = useLocalSearchParams<{
    id: string;
    invite?: string;
  }>();
  // The phone's last copy draws at once; the fresh one replaces it when it arrives.
  const [saved, setCircle] = useState<CircleDetail | null>(() =>
    peekCircle(id),
  );
  // The user's own check-in or role shows at once (the circle's guess, lib/optimistic.ts).
  const { shown: circle, run: guessCircle } = useGuess(saved);
  const [failed, setFailed] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [feed, setFeed] = useState<CircleFeedResponse>(
    () => peekCircleFeed(id) ?? { posts: [], tasks: [] },
  );
  const [summary, setSummary] = useState<string[] | null>(null);
  const [trackers, setTrackers] = useState<SharedTracker[]>(
    () => peekCircleTrackers(id) ?? [],
  );
  // The circle's household list (the fullest grocery one first), from the saved copy of every list.
  const pickList = (all: HouseList[] | null) =>
    (all ?? [])
      .filter((l) => l.circle_id === id)
      .sort(
        (a, b) =>
          Number(b.place === "grocery") - Number(a.place === "grocery") ||
          b.open_count - a.open_count,
      )[0] ?? null;
  const [listOf, setListOf] = useState<HouseList | null>(() =>
    pickList(peekLists()),
  );
  // A server from before lists answers 404: the card shows only once lists have loaded here.
  const [listsOn, setListsOn] = useState(() => peekLists() !== null);

  // Each part loads on its own: the circle shows as soon as it arrives, and a feed or tracker
  // problem never keeps the whole circle from opening.
  const load = useCallback(async () => {
    // What the phone holds first (the same objects when nothing changed: no redraw), then the server.
    const held = {
      circle: peekCircle(id),
      feed: peekCircleFeed(id),
      trackers: peekCircleTrackers(id),
    };
    if (held.circle) setCircle(held.circle);
    if (held.feed) setFeed(held.feed);
    if (held.trackers) setTrackers(held.trackers);
    const feedDone = getCircleFeed(id).then(setFeed, () => {});
    const trackersDone = getCircleTrackers(id).then(setTrackers, () => {});
    void listLists().then(
      (all) => {
        setListOf(pickList(all));
        setListsOn(true);
      },
      () => {},
    );
    const summaryDone = getCircleSummary(id).then(
      (s) => setSummary(s.lines),
      () => setSummary(null),
    );
    try {
      setCircle(await getCircle(id));
      setFailed(null);
    } catch (err) {
      // Left, removed or deleted: drop the saved copy instead of showing it.
      if (err instanceof HttpError && err.status === 404) {
        screenCache.remove(`/circles/${id}`);
        setCircle(null);
      }
      setFailed(failText(err, t.circles.offline));
    }
    await Promise.all([feedDone, trackersDone, summaryDone]);
  }, [id]);

  // Reload on every return to the screen (after sending a request, for example).
  useLive(load);

  const invite = async () => {
    if (inviting) return;
    setInviting(true);
    try {
      const { share_text } = await createInvite(id);
      // WhatsApp first (that is where families and friends already talk); any other app otherwise.
      await Linking.openURL(whatsappShareUrl(share_text)).catch(() =>
        Share.share({ message: share_text }),
      );
      void load();
    } catch {
      notify(t.circles.failed, "error");
    } finally {
      setInviting(false);
    }
  };

  // Zaki's "Invite to …" card opens here with ?invite=1: go straight to the WhatsApp message, once.
  const autoInvited = useRef(false);
  useEffect(() => {
    if (inviteNow !== "1" || autoInvited.current || !circle) return;
    autoInvited.current = true;
    void invite();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteNow, circle]);

  const act = async (
    work: () => Promise<void>,
    leaveScreen: boolean,
    done?: string,
  ) => {
    try {
      await work();
      if (done) notify(done);
      if (leaveScreen) router.back();
      else void load();
    } catch {
      notify(t.circles.failed, "error");
      // Whatever the screen guessed meanwhile goes back to what the server has.
      void load();
    }
  };

  const sendCheckin = (kind: CheckinKind) => {
    // The user's own row shows it at once; "sent" is said when the circle really has it.
    let guessed: CircleDetail | null = null;
    const next = (c: CircleDetail | null) =>
      (guessed = c ? guessCheckin(c, kind, new Date()) : null);
    void guessCircle(() => checkIn(id, kind), {
      next,
      adopt: (answer) => answer,
      keep: (err) => err instanceof QueuedOffline,
    }).then(
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
  const askOne = async (userId: string) => {
    try {
      await askCheckin(id, userId);
      notify(t.family.asked);
    } catch (err) {
      notify(
        err instanceof HttpError && err.status === 409
          ? t.family.askedTooSoon
          : t.circles.failed,
        err instanceof HttpError && err.status === 409 ? "info" : "error",
      );
    }
  };
  const pickRole = (userId: string, role: FamilyRole | null) => {
    const next = (c: CircleDetail | null) =>
      c
        ? {
            ...c,
            members: c.members.map((m) =>
              m.user_id === userId ? { ...m, family_role: role } : m,
            ),
          }
        : null;
    void guessCircle(() => setFamilyRole(id, userId, role), {
      next,
      adopt: (answer) => answer,
    }).then(setCircle, () => notify(t.circles.failed, "error"));
  };
  /** Going / not going shows on the invitation at once. */
  const rsvp = (postId: string, going: boolean) => {
    setFeed((f) => ({
      ...f,
      posts: f.posts.map((p) =>
        p.id === postId ? { ...p, my_rsvp: going } : p,
      ),
    }));
    void act(() => answerInvite(id, postId, going), false);
  };
  const iftar = (pick: IftarDay) =>
    void act(
      () => inviteToIftar(id, iftarDate(pick, new Date())),
      false,
      t.ramadan.sent,
    );
  const askIftarDay = () =>
    ask(t.ramadan.iftarWhen, undefined, [
      { label: t.ramadan.days.today, onPress: () => iftar("today") },
      { label: t.ramadan.days.tomorrow, onPress: () => iftar("tomorrow") },
      { label: t.ramadan.days.friday, onPress: () => iftar("friday") },
    ]);

  if (!circle) {
    return failed ? (
      <View style={styles.center}>
        <Stack.Screen options={{ title: "" }} />
        <Note icon="cloud-offline-outline">{failed}</Note>
        <Button
          label={t.circles.retry}
          kind="tonal"
          onPress={() => void load()}
        />
      </View>
    ) : (
      <Screen>
        <Stack.Screen options={{ title: "" }} />
        <LoadingCards count={4} />
      </Screen>
    );
  }

  const family = circle.kind === "family";
  const tint = family ? palette.family : palette.friends;
  const tintSoft = family ? palette.familySoft : palette.friendsSoft;
  const owner = circle.role === "owner";
  const me = circle.members.find((m) => m.is_me);
  const label = (m: CircleMember) =>
    m.is_me ? t.ui.you : (m.name ?? t.circles.noName);
  const joined = circle.open_invites.reduce((n, i) => n + i.joins, 0);
  const others = circle.members.length > 1;
  const trialDays = circle.trial_until
    ? Math.max(
        0,
        Math.ceil(
          (new Date(circle.trial_until).getTime() - Date.now()) / 86400_000,
        ),
      )
    : 0;

  return (
    <Screen>
      <Stack.Screen options={{ title: circle.name }} />

      <Card tone={tintSoft} style={styles.hero}>
        <View style={styles.heroHead}>
          <IconTile
            name={family ? "home" : "people"}
            color={tint}
            bg={palette.surface}
            size={52}
          />
          <View style={styles.flex}>
            <Text variant="title">{circle.name}</Text>
            <Text variant="small" color={palette.inkSoft}>
              {fill(t.ui.members, { n: circle.members.length })}
            </Text>
          </View>
        </View>
        <View style={styles.faces}>
          {circle.members.slice(0, 6).map((m) => (
            <View key={m.user_id} style={styles.face}>
              <PersonAvatar
                name={label(m)}
                size={34}
                color={tint}
                bg={palette.surface}
              />
            </View>
          ))}
        </View>
        <Button
          label={t.ui.invite}
          kind="whatsapp"
          icon="logo-whatsapp"
          busy={inviting}
          block
          onPress={() => void invite()}
        />
        <Text variant="caption" color={palette.inkSoft}>
          {t.circles.inviteHint}{" "}
          {joined > 0 ? fill(t.circles.joinedCount, { n: joined }) : ""}
        </Text>
        <Text variant="smallStrong" color={palette.ok}>
          {plain(t.circles.inviteReward)}
        </Text>
      </Card>

      <SectionHeader title={t.circles.summaryTitle} />
      {circle.extras ? (
        <Card>
          <View style={styles.summaryHead}>
            <ZakiAvatar size={32} />
            {trialDays > 0 ? (
              <Badge
                label={fill(t.circles.trialLeft, { n: trialDays })}
                tone="primary"
              />
            ) : null}
          </View>
          {(summary ?? []).map((line) => (
            <Text key={line} variant="body">
              {line}
            </Text>
          ))}
        </Card>
      ) : (
        <Card>
          <Text variant="small" color={palette.inkSoft}>
            {t.circles.summaryLocked}
          </Text>
          <Button
            label={t.circles.seePro}
            kind="tonal"
            size="sm"
            icon="sparkles-outline"
            onPress={() => router.push("/paywall")}
            style={styles.center2}
          />
        </Card>
      )}

      <SectionHeader title={t.ui.checkInPrompt} />
      <View style={styles.chips}>
        {checkinOrder(circle.family_type).map((kind) => (
          <Chip
            key={kind}
            label={plain(t.family.checkins[kind])}
            icon={CHECKIN_ICON[kind]}
            tone="family"
            onPress={() => sendCheckin(kind)}
          />
        ))}
      </View>

      <SectionHeader title={t.ui.feedTitle} />
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
          {t.ui.feedEmpty}
        </Text>
      ) : null}
      {feed.posts.slice(0, 30).map((p) => (
        <FeedPost
          key={p.id}
          circleId={id}
          post={p}
          onChange={(next) =>
            setFeed((f) => ({
              ...f,
              posts: f.posts.map((x) => (x.id === next.id ? next : x)),
            }))
          }
          extra={
            p.kind === "iftar" ? (
              <View style={styles.chips}>
                <Chip
                  label={plain(t.ramadan.going)}
                  selected={p.my_rsvp === true}
                  onPress={() => rsvp(p.id, true)}
                />
                <Chip
                  label={plain(t.ramadan.notGoing)}
                  selected={p.my_rsvp === false}
                  onPress={() => rsvp(p.id, false)}
                />
              </View>
            ) : undefined
          }
        />
      ))}

      <SectionHeader
        title={t.ui.tasksTitle}
        action={others ? plain(t.tasks.ask) : undefined}
        onAction={() =>
          router.push({ pathname: "/task/new", params: { circle: id } })
        }
      />
      {feed.tasks.length === 0 ? (
        <Card>
          <Text variant="small" color={palette.inkSoft} align="center">
            {others ? t.tasks.empty : t.tasks.noMembers}
          </Text>
          {others ? (
            <Button
              label={plain(t.tasks.ask)}
              kind="tonal"
              size="sm"
              icon="add"
              onPress={() =>
                router.push({ pathname: "/task/new", params: { circle: id } })
              }
              style={styles.center2}
            />
          ) : null}
        </Card>
      ) : null}
      {sortTasks(feed.tasks).map((task) => (
        <TaskCard key={task.id} task={task} onChanged={() => void load()} />
      ))}
      {others ? (
        <View style={styles.chips}>
          <Button
            label={plain(t.homework.planOpen)}
            kind="tonal"
            size="sm"
            icon="school-outline"
            onPress={() =>
              router.push({
                pathname: "/homework/plan",
                params: { circle: id },
              })
            }
          />
          <Button
            label={plain(t.homework.pocketOpen)}
            kind="text"
            size="sm"
            icon="wallet-outline"
            onPress={() => router.push("/pocket")}
          />
          <Button
            label={plain(t.homework.helpOpen)}
            kind="text"
            size="sm"
            icon="bulb-outline"
            onPress={() => router.push("/homework/help")}
          />
        </View>
      ) : null}

      {listsOn ? (
        <Card
          onPress={() =>
            router.push(
              listOf
                ? { pathname: "/list/[id]", params: { id: listOf.id } }
                : { pathname: "/list", params: { circle: id } },
            )
          }
          accessibilityLabel={t.lists.open}
        >
          <View style={styles.listRow}>
            <IconTile
              name="cart-outline"
              size={40}
              color={palette.family}
              bg={palette.familySoft}
            />
            <View style={styles.flex}>
              <Text variant="bodyStrong">{listOf?.name ?? t.lists.open}</Text>
              <Text variant="small" color={palette.inkSoft} numberOfLines={1}>
                {listOf
                  ? listOf.trip
                    ? listOf.trip.is_me
                      ? t.lists.tripMine
                      : fill(t.lists.tripOther, {
                          name: listOf.trip.name ?? t.circles.noName,
                        })
                    : listOf.open_count
                      ? fill(t.lists.count, { n: listOf.open_count })
                      : t.lists.allDone
                  : t.lists.new}
              </Text>
            </View>
            <Icon name="chevron-forward" size={18} color={palette.inkSoft} />
          </View>
        </Card>
      ) : null}

      <SectionHeader
        title={t.trackers.circleTitle}
        action={t.trackers.circleAdd}
        onAction={() =>
          router.push({ pathname: "/tracker/new", params: { circle: id } })
        }
      />
      {trackers.length === 0 ? (
        <Card>
          <Text variant="small" color={palette.inkSoft} align="center">
            {t.trackers.circleEmpty}
          </Text>
        </Card>
      ) : (
        <Card style={styles.members}>
          {trackers.map((tr, n) => (
            <View
              key={tr.id}
              style={[styles.member, n > 0 && styles.memberLine]}
            >
              <IconTile name={TRACKER_ICON[tr.kind]} />
              <View style={styles.flex}>
                <Text variant="bodyStrong">{trackerName(tr)}</Text>
                <Text variant="small" color={palette.inkSoft}>
                  {[
                    tr.is_mine
                      ? t.trackers.mine
                      : (tr.owner_name ?? t.circles.noName),
                    tr.goal
                      ? fill(t.trackers.ofGoalToday, {
                          n: tr.today,
                          goal: tr.goal,
                        })
                      : fill(t.trackers.today, { n: tr.today }),
                  ].join(" · ")}
                </Text>
              </View>
              {tr.streak >= 2 ? <TrackerStreak days={tr.streak} /> : null}
            </View>
          ))}
        </Card>
      )}

      <Button
        label={t.circles.bookAction}
        kind="outline"
        icon="receipt-outline"
        block
        onPress={() =>
          router.push({ pathname: "/money/new", params: { circle: id } })
        }
      />

      {isRamadanSeason(new Date()) && others ? (
        <Button
          label={plain(t.ramadan.iftar)}
          kind="outline"
          icon="moon-outline"
          block
          onPress={askIftarDay}
        />
      ) : null}

      <SectionHeader title={t.ui.people} />
      <Card style={styles.members}>
        {circle.members.map((m, n) => (
          <View
            key={m.user_id}
            style={[styles.member, n > 0 && styles.memberLine]}
          >
            <PersonAvatar name={label(m)} color={tint} bg={tintSoft} />
            <View style={styles.flex}>
              <Text variant="bodyStrong">{label(m)}</Text>
              <Text variant="small" color={palette.inkSoft} numberOfLines={2}>
                {[
                  m.role === "owner" ? t.circles.owner : null,
                  m.family_role ? t.family.roles[m.family_role] : null,
                  m.last_checkin
                    ? fill(t.ui.lastSeen, {
                        what: plain(t.family.checkins[m.last_checkin.kind]),
                        when: ago(m.last_checkin.at),
                      })
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || " "}
              </Text>
            </View>
            {!m.is_me ? (
              <IconButton
                name="hand-left-outline"
                label={t.family.ask}
                color={tint}
                onPress={() => void askOne(m.user_id)}
              />
            ) : null}
            {owner && !m.is_me ? (
              <IconButton
                name="person-remove-outline"
                label={t.circles.remove}
                color={palette.danger}
                onPress={() =>
                  confirm(
                    fill(t.circles.removeConfirm, { name: label(m) }),
                    t.circles.yes,
                    () =>
                      void act(() => removeCircleMember(id, m.user_id), false),
                    t.circles.cancel,
                  )
                }
              />
            ) : null}
          </View>
        ))}
      </Card>

      {family && me ? (
        <>
          <SectionHeader title={t.ui.yourRole} />
          <View style={styles.chips}>
            {FamilyRole.options.map((role) => (
              <Chip
                key={role}
                label={t.family.roles[role]}
                tone="family"
                selected={me.family_role === role}
                onPress={() =>
                  pickRole(me.user_id, me.family_role === role ? null : role)
                }
              />
            ))}
          </View>
        </>
      ) : null}

      <View style={styles.danger}>
        {me ? (
          <Button
            label={t.circles.leave}
            kind="danger"
            icon="exit-outline"
            onPress={() =>
              confirm(
                t.circles.leaveConfirm,
                t.circles.yes,
                () => void act(() => removeCircleMember(id, me.user_id), true),
                t.circles.cancel,
              )
            }
          />
        ) : null}
        {owner ? (
          <Button
            label={t.circles.delete}
            kind="danger"
            icon="trash-outline"
            onPress={() =>
              confirm(
                t.circles.deleteConfirm,
                t.circles.yes,
                () => void act(() => deleteCircle(id), true),
                t.circles.cancel,
              )
            }
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  listRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  flex: { flex: 1, minWidth: 0 },
  center: {
    flex: 1,
    backgroundColor: palette.bg,
    alignItems: "center",
    justifyContent: "center",
    gap: space.md,
    padding: space.xl,
  },
  center2: { alignSelf: "center" },
  hero: { gap: space.md },
  summaryHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  faces: { flexDirection: "row", paddingStart: 6 },
  face: {
    marginStart: -6,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: palette.surface,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  post: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  postBody: {
    ...glass,
    flex: 1,
    borderRadius: 18,
    borderTopStartRadius: 6,
    padding: space.md,
    gap: 2,
  },
  members: { paddingVertical: space.xs, gap: 0 },
  member: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.md,
  },
  memberLine: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.line,
  },
  danger: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: space.sm,
    marginTop: space.lg,
  },
});
