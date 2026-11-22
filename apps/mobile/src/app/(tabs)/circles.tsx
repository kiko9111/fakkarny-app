import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import type { Circle } from "@fakkarni/shared";
import { fill, groupCircles } from "@/circles/logic";
import { t } from "@/i18n";
import { listCircles } from "@/lib/api";
import { Button, IconTile, ListRow, Note, palette, Screen, SectionHeader, space, Text } from "@/ui";

/** The Family and Friends spaces: the user's circles, and the way into creating or joining one. */
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

  const { family, friends } = groupCircles(circles ?? []);
  const row = (c: Circle) => (
    <ListRow
      key={c.id}
      leading={<IconTile name={c.kind === "family" ? "home" : "people"} color={c.kind === "family" ? palette.family : palette.friends} bg={c.kind === "family" ? palette.familySoft : palette.friendsSoft} />}
      title={c.name}
      meta={fill(t.ui.members, { n: c.member_count })}
      onPress={() => router.push({ pathname: "/circle/[id]", params: { id: c.id } })}
    />
  );

  const section = (kind: "family" | "friends", list: Circle[]) => (
    <>
      <SectionHeader title={kind === "family" ? t.ui.family : t.ui.friends} action={t.ui.newCircle} onAction={() => router.push({ pathname: "/circle/new", params: { kind } })} />
      {list.map(row)}
      {circles !== null && list.length === 0 ? (
        <Button label={kind === "family" ? t.circles.newFamily : t.circles.newFriends} kind="outline" icon="add" block onPress={() => router.push({ pathname: "/circle/new", params: { kind } })} />
      ) : null}
    </>
  );

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load().finally(() => setRefreshing(false));
      }}
    >
      <Text variant="small" color={palette.inkSoft}>
        {t.ui.peopleLine}
      </Text>
      {failed && circles === null ? (
        <View style={styles.offline}>
          <Note icon="cloud-offline-outline">{t.circles.offline}</Note>
          <Button label={t.circles.retry} kind="text" size="sm" onPress={() => void load()} />
        </View>
      ) : null}
      {section("family", family)}
      {section("friends", friends)}
      <Button label={t.ui.haveCode} kind="text" icon="key-outline" onPress={() => router.push("/invite")} style={styles.code} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  offline: { gap: space.xs },
  code: { alignSelf: "center", marginTop: space.md },
});
