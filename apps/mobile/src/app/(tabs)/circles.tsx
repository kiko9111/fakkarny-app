import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import type { Circle } from "@fakkarni/shared";
import { SectionTitle } from "@/components/ItemRow";
import { fill, groupCircles } from "@/circles/logic";
import { t } from "@/i18n";
import { listCircles } from "@/lib/api";
import { colors } from "@/lib/theme";

/** The Friends and Family spaces: the user's circles, and the way into creating or joining one. */
export default function CirclesScreen() {
  const [circles, setCircles] = useState<Circle[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setCircles(await listCircles());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  // Reload whenever the tab comes back into view (after creating, joining or leaving).
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const { family, friends } = groupCircles(circles ?? []);
  const row = (c: Circle) => (
    <Pressable key={c.id} style={({ pressed }) => [styles.row, pressed && styles.pressed]} onPress={() => router.push({ pathname: "/circle/[id]", params: { id: c.id } })} accessibilityRole="button">
      <Text style={styles.emoji}>{c.kind === "family" ? "🏡" : "🤝"}</Text>
      <View style={styles.flex}>
        <Text style={styles.name}>{c.name}</Text>
        <Text style={styles.meta}>{fill(t.circles.members, { n: c.member_count })}</Text>
      </View>
    </Pressable>
  );
  const add = (label: string, kind: "family" | "friends") => (
    <Pressable style={({ pressed }) => [styles.add, pressed && styles.pressed]} onPress={() => router.push({ pathname: "/circle/new", params: { kind } })} accessibilityRole="button">
      <Text style={styles.addText}>{label}</Text>
    </Pressable>
  );

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}>
      <Text style={styles.intro}>{t.circles.intro}</Text>
      {failed && circles === null ? (
        <View style={styles.offline}>
          <Text style={styles.meta}>{t.circles.offline}</Text>
          <Pressable onPress={() => void load()}>
            <Text style={styles.link}>{t.circles.retry}</Text>
          </Pressable>
        </View>
      ) : null}

      <SectionTitle>{t.circles.family}</SectionTitle>
      {family.map(row)}
      {add(t.circles.newFamily, "family")}

      <SectionTitle>{t.circles.friends}</SectionTitle>
      {friends.map(row)}
      {add(t.circles.newFriends, "friends")}

      <Pressable style={styles.invite} onPress={() => router.push("/invite")} accessibilityRole="button">
        <Text style={styles.link}>{t.circles.haveInvite}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 8 },
  intro: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: "left", marginBottom: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  pressed: { opacity: 0.6 },
  emoji: { fontSize: 24 },
  flex: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: "600", color: colors.text, textAlign: "left" },
  meta: { fontSize: 13, color: colors.muted, textAlign: "left" },
  add: { borderWidth: 1, borderColor: colors.accent, borderStyle: "dashed", borderRadius: 14, paddingVertical: 12, alignItems: "center" },
  addText: { color: colors.accent, fontWeight: "600", fontSize: 15 },
  offline: { backgroundColor: "#fff", borderRadius: 14, padding: 14, gap: 6 },
  invite: { alignItems: "center", paddingVertical: 16 },
  link: { color: colors.accent, fontWeight: "600", fontSize: 15 },
});
