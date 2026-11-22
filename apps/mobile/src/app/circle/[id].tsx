import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import type { CircleDetail, CircleFeedResponse, CircleMember } from "@fakkarni/shared";
import { ItemRow, SectionTitle } from "@/components/ItemRow";
import { fill, whatsappShareUrl } from "@/circles/logic";
import { t } from "@/i18n";
import { createInvite, deleteCircle, getCircle, getCircleFeed, removeCircleMember } from "@/lib/api";
import { colors } from "@/lib/theme";
import { sortTasks } from "@/tasks/logic";
import { TaskCard } from "@/tasks/TaskCard";

const confirm = (message: string, onYes: () => void) =>
  Alert.alert(message, undefined, [
    { text: t.circles.cancel, style: "cancel" },
    { text: t.circles.yes, style: "destructive", onPress: onYes },
  ]);

/** One circle: requests between its people, what Zaki posted, who is in it, and the invite that grows it. */
export default function CircleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [circle, setCircle] = useState<CircleDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [feed, setFeed] = useState<CircleFeedResponse>({ posts: [], tasks: [] });

  const load = useCallback(async () => {
    try {
      const [c, f] = await Promise.all([getCircle(id), getCircleFeed(id)]);
      setCircle(c);
      setFeed(f);
      setFailed(false);
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
      Alert.alert(t.circles.failed);
    } finally {
      setInviting(false);
    }
  };

  const act = async (work: () => Promise<void>, leaveScreen: boolean) => {
    try {
      await work();
      if (leaveScreen) router.back();
      else void load();
    } catch {
      Alert.alert(t.circles.failed);
    }
  };

  if (!circle) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: "" }} />
        {failed ? (
          <>
            <Text style={styles.muted}>{t.circles.offline}</Text>
            <Pressable onPress={() => void load()}>
              <Text style={styles.link}>{t.circles.retry}</Text>
            </Pressable>
          </>
        ) : (
          <ActivityIndicator color={colors.accent} />
        )}
      </View>
    );
  }

  const owner = circle.role === "owner";
  const me = circle.members.find((m) => m.is_me);
  const label = (m: CircleMember) => (m.is_me ? t.circles.you : m.name ?? t.circles.noName);
  const joined = circle.open_invites.reduce((n, i) => n + i.joins, 0);

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: circle.name }} />

      <Pressable style={[styles.primary, inviting && styles.dim]} disabled={inviting} onPress={() => void invite()} accessibilityRole="button">
        {inviting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{t.circles.invite}</Text>}
      </Pressable>
      <Text style={styles.muted}>{t.circles.inviteHint}</Text>
      <Text style={styles.reward}>{t.circles.inviteReward}</Text>
      {joined > 0 ? <Text style={styles.muted}>{fill(t.circles.joinedCount, { n: joined })}</Text> : null}

      <SectionTitle>{t.tasks.title}</SectionTitle>
      {circle.members.length > 1 ? (
        <Pressable style={styles.ask} onPress={() => router.push({ pathname: "/task/new", params: { circle: id } })} accessibilityRole="button">
          <Text style={styles.askText}>{t.tasks.ask}</Text>
        </Pressable>
      ) : null}
      {feed.tasks.length === 0 ? <Text style={styles.muted}>{circle.members.length > 1 ? t.tasks.empty : t.tasks.noMembers}</Text> : null}
      {sortTasks(feed.tasks).map((task) => (
        <TaskCard key={task.id} task={task} onChanged={() => void load()} />
      ))}

      {feed.posts.length ? <SectionTitle>{t.tasks.zakiTitle}</SectionTitle> : null}
      {feed.posts.slice(0, 20).map((p) => (
        <View key={p.id} style={styles.post}>
          <Text style={styles.postBy}>🌟 {t.tasks.zaki}</Text>
          <Text style={styles.postText}>{p.text}</Text>
        </View>
      ))}

      <SectionTitle>{t.circles.membersTitle}</SectionTitle>
      {circle.members.map((m) => (
        <ItemRow
          key={m.user_id}
          title={label(m)}
          meta={m.role === "owner" ? t.circles.owner : undefined}
          action={owner && !m.is_me ? t.circles.remove : undefined}
          onAction={owner && !m.is_me ? () => confirm(fill(t.circles.removeConfirm, { name: label(m) }), () => void act(() => removeCircleMember(id, m.user_id), false)) : undefined}
        />
      ))}

      {me ? (
        <Pressable style={styles.quiet} onPress={() => confirm(t.circles.leaveConfirm, () => void act(() => removeCircleMember(id, me.user_id), true))}>
          <Text style={styles.danger}>{t.circles.leave}</Text>
        </Pressable>
      ) : null}
      {owner ? (
        <Pressable style={styles.quiet} onPress={() => confirm(t.circles.deleteConfirm, () => void act(() => deleteCircle(id), true))}>
          <Text style={styles.danger}>{t.circles.delete}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 8 },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },
  primary: { backgroundColor: "#25A35A", borderRadius: 16, paddingVertical: 14, alignItems: "center" },
  primaryText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  dim: { opacity: 0.6 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: "left" },
  reward: { color: colors.ok, fontSize: 14, fontWeight: "600", textAlign: "left" },
  link: { color: colors.accent, fontWeight: "600", fontSize: 15 },
  ask: { borderWidth: 1, borderColor: colors.accent, borderRadius: 16, paddingVertical: 12, alignItems: "center" },
  askText: { color: colors.accent, fontSize: 16, fontWeight: "700" },
  post: { backgroundColor: "#fff", borderRadius: 14, padding: 12, gap: 2 },
  postBy: { color: colors.accent, fontSize: 12, fontWeight: "700", textAlign: "left" },
  postText: { color: colors.text, fontSize: 15, lineHeight: 22, textAlign: "left" },
  quiet: { alignItems: "center", paddingVertical: 10 },
  danger: { color: colors.error, fontSize: 14 },
});
