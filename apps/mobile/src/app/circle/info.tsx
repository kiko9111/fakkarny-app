import { useCallback } from "react";
import { StyleSheet, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { FamilyRole, type CircleDetail, type CircleMember } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { ago, CircleWaiting, memberName, useCircle, useInvite } from "@/circles/useCircle";
import { t } from "@/i18n";
import { askCheckin, deleteCircle, removeCircleMember, setFamilyRole } from "@/lib/api";
import { useLive } from "@/lib/live";
import { HttpError } from "@/sync/queue";
import { Button, Card, Chip, confirm, IconButton, NavRow, notify, palette, PersonAvatar, plain, RowGroup, Screen, SectionHeader, space, Text } from "@/ui";

/** Circle info: who is in it, the invite that grows it, the reader's role, and last, leaving or deleting it. */
export default function CircleInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { circle, setCircle, guessCircle, failed, showHeld, loadCircle } = useCircle(id);

  const load = useCallback(async () => {
    showHeld();
    await loadCircle();
  }, [showHeld, loadCircle]);
  useLive(load);

  const { inviting, invite } = useInvite(id, () => void load());

  /** Out of a circle that is gone for this person: back to where the circles are, not to its summary. */
  const leaveScreens = () => (router.canDismiss() ? router.dismissAll() : router.replace("/circles"));
  const act = async (work: () => Promise<void>, leaveScreen: boolean) => {
    try {
      await work();
      if (leaveScreen) leaveScreens();
      else void load();
    } catch {
      notify(t.circles.failed, "error");
      // Whatever the screen guessed meanwhile goes back to what the server has.
      void load();
    }
  };
  const askOne = async (userId: string) => {
    try {
      await askCheckin(id, userId);
      notify(t.family.asked);
    } catch (err) {
      const tooSoon = err instanceof HttpError && err.status === 409;
      notify(tooSoon ? t.family.askedTooSoon : t.circles.failed, tooSoon ? "info" : "error");
    }
  };
  const pickRole = (userId: string, role: FamilyRole | null) => {
    const next = (c: CircleDetail | null) => (c ? { ...c, members: c.members.map((m) => (m.user_id === userId ? { ...m, family_role: role } : m)) } : null);
    void guessCircle(() => setFamilyRole(id, userId, role), { next, adopt: (answer) => answer }).then(setCircle, () => notify(t.circles.failed, "error"));
  };

  const roleLine = (m: CircleMember) => [m.role === "owner" ? t.circles.owner : null, m.family_role ? t.family.roles[m.family_role] : null].filter(Boolean).join(" · ");
  const memberOptions = (m: CircleMember) => confirm(fill(t.circles.removeConfirm, { name: memberName(m) }), t.circles.remove, () => void act(() => removeCircleMember(id, m.user_id), false), t.circles.cancel);

  if (!circle) return <CircleWaiting failed={failed} onRetry={() => void load()} />;

  const family = circle.kind === "family";
  const tint = family ? palette.family : palette.friends;
  const tintSoft = family ? palette.familySoft : palette.friendsSoft;
  const owner = circle.role === "owner";
  const me = circle.members.find((m) => m.is_me);

  return (
    <Screen>
      <Stack.Screen options={{ title: t.lay.circle.infoTitle }} />

      <SectionHeader title={t.lay.circle.members} />
      <Card style={styles.members}>
        {circle.members.map((m, n) => (
          <View key={m.user_id} style={[styles.member, n > 0 && styles.memberLine]}>
            <PersonAvatar name={memberName(m)} color={tint} bg={tintSoft} />
            <View style={styles.flex}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {memberName(m)}
              </Text>
              {roleLine(m) ? (
                <Text variant="small" color={palette.inkSoft} numberOfLines={2}>
                  {roleLine(m)}
                </Text>
              ) : null}
              {/* What each person last said and when: a parent sees who got home. */}
              {m.last_checkin ? (
                <Text variant="small" color={tint} numberOfLines={1}>
                  {fill(t.ui.lastSeen, { what: plain(t.family.checkins[m.last_checkin.kind]), when: ago(m.last_checkin.at) })}
                </Text>
              ) : null}
            </View>
            {!m.is_me ? <IconButton name="hand-left-outline" label={plain(t.family.ask)} color={tint} onPress={() => void askOne(m.user_id)} /> : null}
            {owner && !m.is_me ? (
              // Removing someone is not one thumb-width from "ask to check in": it is behind this.
              <IconButton name="ellipsis-horizontal" label={fill(t.lay.circle.memberMore, { name: memberName(m) })} onPress={() => memberOptions(m)} />
            ) : null}
          </View>
        ))}
      </Card>
      <Button label={t.circles.invite} kind="whatsapp" icon="logo-whatsapp" busy={inviting} block onPress={() => void invite()} />

      {family && me ? (
        <>
          <SectionHeader title={t.ui.yourRole} />
          <View style={styles.chips}>
            {FamilyRole.options.map((role) => (
              <Chip key={role} label={t.family.roles[role]} tone="family" selected={me.family_role === role} onPress={() => pickRole(me.user_id, me.family_role === role ? null : role)} />
            ))}
          </View>
        </>
      ) : null}

      <View style={styles.last}>
        <RowGroup>
          {me ? (
            <NavRow
              icon="exit-outline"
              title={t.circles.leave}
              danger
              onPress={() => confirm(t.circles.leaveConfirm, t.circles.yes, () => void act(() => removeCircleMember(id, me.user_id), true), t.circles.cancel)}
            />
          ) : null}
          {owner ? (
            <NavRow icon="trash-outline" title={t.circles.delete} danger onPress={() => confirm(t.circles.deleteConfirm, t.circles.yes, () => void act(() => deleteCircle(id), true), t.circles.cancel)} />
          ) : null}
        </RowGroup>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  members: { paddingVertical: space.xs, gap: 0 },
  member: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md },
  memberLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  // Leaving and deleting sit apart from everything else, at the very end.
  last: { marginTop: space.xxl },
});
