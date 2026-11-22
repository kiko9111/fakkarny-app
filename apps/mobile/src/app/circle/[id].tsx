import { useCallback, useState } from "react";
import { ActivityIndicator, Linking, Share, StyleSheet, View } from "react-native";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { checkinOrder, FamilyRole, isRamadanSeason, type CheckinKind, type CircleDetail, type CircleFeedResponse, type CircleMember } from "@fakkarni/shared";
import { fill, whatsappShareUrl } from "@/circles/logic";
import { t, dateLocale } from "@/i18n";
import { answerInvite, askCheckin, checkIn, inviteToIftar, createInvite, deleteCircle, getCircle, getCircleFeed, getCircleSummary, removeCircleMember, setFamilyRole } from "@/lib/api";
import { HttpError } from "@/sync/queue";
import { iftarDate, sortTasks, type IftarDay } from "@/tasks/logic";
import { TaskCard } from "@/tasks/TaskCard";
import { glass, ask, Badge, Button, Card, Chip, confirm, IconButton, IconTile, Note, notify, palette, PersonAvatar, plain, Screen, SectionHeader, space, Text, ZakiAvatar, type IconName } from "@/ui";

const CHECKIN_ICON: Record<CheckinKind, IconName> = { arrived: "flag-outline", home: "home-outline", on_way: "car-outline", medicine: "medkit-outline", ok: "happy-outline" };
const ago = (iso: string) => new Date(iso).toLocaleString(dateLocale, { weekday: "short", hour: "numeric", minute: "2-digit" });

/** One circle: who's OK, requests between its people, what Zaki posted, and the invite that grows it. */
export default function CircleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [circle, setCircle] = useState<CircleDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [feed, setFeed] = useState<CircleFeedResponse>({ posts: [], tasks: [] });
  const [summary, setSummary] = useState<string[] | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, f] = await Promise.all([getCircle(id), getCircleFeed(id)]);
      setCircle(c);
      setFeed(f);
      setFailed(false);
      setSummary(c.extras ? (await getCircleSummary(id).catch(() => null))?.lines ?? null : null);
    } catch {
      setFailed(true);
    }
  }, [id]);

  // Reload on every return to the screen (after sending a request, for example).
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const invite = async () => {
    if (inviting) return;
    setInviting(true);
    try {
      const { share_text } = await createInvite(id);
      // WhatsApp first (that is where families and friends already talk); any other app otherwise.
      await Linking.openURL(whatsappShareUrl(share_text)).catch(() => Share.share({ message: share_text }));
      void load();
    } catch {
      notify(t.circles.failed, "error");
    } finally {
      setInviting(false);
    }
  };

  const act = async (work: () => Promise<void>, leaveScreen: boolean, done?: string) => {
    try {
      await work();
      if (done) notify(done);
      if (leaveScreen) router.back();
      else void load();
    } catch {
      notify(t.circles.failed, "error");
    }
  };

  const sendCheckin = async (kind: CheckinKind) => {
    try {
      setCircle(await checkIn(id, kind));
      notify(t.family.checkedIn);
      void load();
    } catch {
      notify(t.circles.failed, "error");
    }
  };
  const askOne = async (userId: string) => {
    try {
      await askCheckin(id, userId);
      notify(t.family.asked);
    } catch (err) {
      notify(err instanceof HttpError && err.status === 409 ? t.family.askedTooSoon : t.circles.failed, err instanceof HttpError && err.status === 409 ? "info" : "error");
    }
  };
  const pickRole = async (userId: string, role: FamilyRole | null) => {
    try {
      setCircle(await setFamilyRole(id, userId, role));
    } catch {
      notify(t.circles.failed, "error");
    }
  };
  const iftar = (pick: IftarDay) => void act(() => inviteToIftar(id, iftarDate(pick, new Date())), false, t.ramadan.sent);
  const askIftarDay = () =>
    ask(t.ramadan.iftarWhen, undefined, [
      { label: t.ramadan.days.today, onPress: () => iftar("today") },
      { label: t.ramadan.days.tomorrow, onPress: () => iftar("tomorrow") },
      { label: t.ramadan.days.friday, onPress: () => iftar("friday") },
    ]);

  if (!circle) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: "" }} />
        {failed ? (
          <>
            <Note icon="cloud-offline-outline">{t.circles.offline}</Note>
            <Button label={t.circles.retry} kind="tonal" onPress={() => void load()} />
          </>
        ) : (
          <ActivityIndicator color={palette.primary} />
        )}
      </View>
    );
  }

  const family = circle.kind === "family";
  const tint = family ? palette.family : palette.friends;
  const tintSoft = family ? palette.familySoft : palette.friendsSoft;
  const owner = circle.role === "owner";
  const me = circle.members.find((m) => m.is_me);
  const label = (m: CircleMember) => (m.is_me ? t.ui.you : m.name ?? t.circles.noName);
  const joined = circle.open_invites.reduce((n, i) => n + i.joins, 0);
  const others = circle.members.length > 1;
  const trialDays = circle.trial_until ? Math.max(0, Math.ceil((new Date(circle.trial_until).getTime() - Date.now()) / 86400_000)) : 0;

  return (
    <Screen>
      <Stack.Screen options={{ title: circle.name }} />

      <Card tone={tintSoft} style={styles.hero}>
        <View style={styles.heroHead}>
          <IconTile name={family ? "home" : "people"} color={tint} bg={palette.surface} size={52} />
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
              <PersonAvatar name={label(m)} size={34} color={tint} bg={palette.surface} />
            </View>
          ))}
        </View>
        <Button label={t.ui.invite} kind="whatsapp" icon="logo-whatsapp" busy={inviting} block onPress={() => void invite()} />
        <Text variant="caption" color={palette.inkSoft}>
          {t.circles.inviteHint} {joined > 0 ? fill(t.circles.joinedCount, { n: joined }) : ""}
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
            {trialDays > 0 ? <Badge label={fill(t.circles.trialLeft, { n: trialDays })} tone="primary" /> : null}
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
          <Button label={t.circles.seePro} kind="tonal" size="sm" icon="sparkles-outline" onPress={() => router.push("/paywall")} style={styles.center2} />
        </Card>
      )}

      <SectionHeader title={t.ui.checkInPrompt} />
      <View style={styles.chips}>
        {checkinOrder(circle.family_type).map((kind) => (
          <Chip key={kind} label={plain(t.family.checkins[kind])} icon={CHECKIN_ICON[kind]} tone="family" onPress={() => void sendCheckin(kind)} />
        ))}
      </View>

      <SectionHeader title={t.ui.tasksTitle} action={others ? plain(t.tasks.ask) : undefined} onAction={() => router.push({ pathname: "/task/new", params: { circle: id } })} />
      {feed.tasks.length === 0 ? (
        <Card>
          <Text variant="small" color={palette.inkSoft} align="center">
            {others ? t.tasks.empty : t.tasks.noMembers}
          </Text>
          {others ? <Button label={plain(t.tasks.ask)} kind="tonal" size="sm" icon="add" onPress={() => router.push({ pathname: "/task/new", params: { circle: id } })} style={styles.center2} /> : null}
        </Card>
      ) : null}
      {sortTasks(feed.tasks).map((task) => (
        <TaskCard key={task.id} task={task} onChanged={() => void load()} />
      ))}

      {isRamadanSeason(new Date()) && others ? <Button label={plain(t.ramadan.iftar)} kind="outline" icon="moon-outline" block onPress={askIftarDay} /> : null}

      {feed.posts.length ? <SectionHeader title={t.ui.zakiPosts} /> : null}
      {feed.posts.slice(0, 20).map((p) => (
        <View key={p.id} style={styles.post}>
          <ZakiAvatar size={28} />
          <View style={styles.postBody}>
            <Text variant="body">{p.text}</Text>
            <Text variant="caption" color={palette.inkFaint}>
              {ago(p.created_at)}
            </Text>
            {p.kind === "iftar" ? (
              <View style={styles.chips}>
                <Chip label={plain(t.ramadan.going)} selected={p.my_rsvp === true} onPress={() => void act(() => answerInvite(id, p.id, true), false)} />
                <Chip label={plain(t.ramadan.notGoing)} selected={p.my_rsvp === false} onPress={() => void act(() => answerInvite(id, p.id, false), false)} />
              </View>
            ) : null}
          </View>
        </View>
      ))}

      <SectionHeader title={t.ui.people} />
      <Card style={styles.members}>
        {circle.members.map((m, n) => (
          <View key={m.user_id} style={[styles.member, n > 0 && styles.memberLine]}>
            <PersonAvatar name={label(m)} color={tint} bg={tintSoft} />
            <View style={styles.flex}>
              <Text variant="bodyStrong">{label(m)}</Text>
              <Text variant="small" color={palette.inkSoft} numberOfLines={2}>
                {[m.role === "owner" ? t.circles.owner : null, m.family_role ? t.family.roles[m.family_role] : null, m.last_checkin ? fill(t.ui.lastSeen, { what: plain(t.family.checkins[m.last_checkin.kind]), when: ago(m.last_checkin.at) }) : null]
                  .filter(Boolean)
                  .join(" · ") || " "}
              </Text>
            </View>
            {!m.is_me ? <IconButton name="hand-left-outline" label={t.family.ask} color={tint} onPress={() => void askOne(m.user_id)} /> : null}
            {owner && !m.is_me ? <IconButton name="person-remove-outline" label={t.circles.remove} color={palette.danger} onPress={() => confirm(fill(t.circles.removeConfirm, { name: label(m) }), t.circles.yes, () => void act(() => removeCircleMember(id, m.user_id), false), t.circles.cancel)} /> : null}
          </View>
        ))}
      </Card>

      {family && me ? (
        <>
          <SectionHeader title={t.ui.yourRole} />
          <View style={styles.chips}>
            {FamilyRole.options.map((role) => (
              <Chip key={role} label={t.family.roles[role]} tone="family" selected={me.family_role === role} onPress={() => void pickRole(me.user_id, me.family_role === role ? null : role)} />
            ))}
          </View>
        </>
      ) : null}

      <View style={styles.danger}>
        {me ? <Button label={t.circles.leave} kind="danger" icon="exit-outline" onPress={() => confirm(t.circles.leaveConfirm, t.circles.yes, () => void act(() => removeCircleMember(id, me.user_id), true), t.circles.cancel)} /> : null}
        {owner ? <Button label={t.circles.delete} kind="danger" icon="trash-outline" onPress={() => confirm(t.circles.deleteConfirm, t.circles.yes, () => void act(() => deleteCircle(id), true), t.circles.cancel)} /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  center: { flex: 1, backgroundColor: palette.bg, alignItems: "center", justifyContent: "center", gap: space.md, padding: space.xl },
  center2: { alignSelf: "center" },
  hero: { gap: space.md },
  summaryHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  faces: { flexDirection: "row", paddingStart: 6 },
  face: { marginStart: -6, borderRadius: 20, borderWidth: 2, borderColor: palette.surface },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  post: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  postBody: { ...glass, flex: 1, borderRadius: 18, borderTopStartRadius: 6, padding: space.md, gap: 2 },
  members: { paddingVertical: space.xs, gap: 0 },
  member: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md },
  memberLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line },
  danger: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: space.sm, marginTop: space.lg },
});
