import { useCallback, useState } from "react";
import { useLive } from "@/lib/live";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import type { Circle } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { t } from "@/i18n";
import { listCircles, peekCircles } from "@/lib/api";
import { failText } from "@/lib/errors";
import { Button, IconTile, ListRow, LoadingCards, Note, palette, Screen, SectionHeader, space, Text } from "@/ui";

/** The user's circles (family, friends, work, any group), and the way into creating or joining one. */
export default function CirclesScreen() {
  const [circles, setCircles] = useState<Circle[] | null>(() => peekCircles());
  const [failed, setFailed] = useState<string | null>(null);

  const load = useCallback(async () => {
    // What the phone holds first (the same object when nothing changed: no redraw), then the server.
    const held = peekCircles();
    if (held) setCircles(held);
    try {
      setCircles(await listCircles());
      setFailed(null);
    } catch (err) {
      setFailed(failText(err, t.circles.offline));
    }
  }, []);

  // Reload whenever the tab comes back into view (after creating, joining or leaving).
  useLive(load);

  const row = (c: Circle) => (
    <ListRow
      key={c.id}
      leading={<IconTile name={c.kind === "family" ? "home" : "people"} color={c.kind === "family" ? palette.family : palette.friends} bg={c.kind === "family" ? palette.familySoft : palette.friendsSoft} />}
      title={c.name}
      meta={fill(t.ui.members, { n: c.member_count })}
      onPress={() => router.push({ pathname: "/circle/[id]", params: { id: c.id } })}
    />
  );

  const newCircle = () => router.push("/circle/new");
  return (
    <Screen
      onRefresh={load}
    >
      <Text variant="small" color={palette.inkSoft}>
        {t.ui.peopleLine}
      </Text>
      {failed && circles === null ? (
        <View style={styles.offline}>
          <Note icon="cloud-offline-outline">{failed}</Note>
          <Button label={t.circles.retry} kind="text" size="sm" onPress={() => void load()} />
        </View>
      ) : null}
      <SectionHeader title={t.circles.yours} action={t.ui.newCircle} onAction={newCircle} />
      {circles === null && !failed ? <LoadingCards count={2} /> : null}
      {(circles ?? []).map(row)}
      {circles !== null && circles.length === 0 ? (
        <Text variant="small" color={palette.inkSoft}>
          {t.circles.emptyYours}
        </Text>
      ) : null}
      {circles !== null ? <Button label={t.circles.newTitle} kind={circles.length ? "outline" : "filled"} icon="add" block onPress={newCircle} /> : null}
      <Button label={t.ui.haveCode} kind="text" icon="key-outline" onPress={() => router.push("/invite")} style={styles.code} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  offline: { gap: space.xs },
  code: { alignSelf: "center", marginTop: space.md },
});
