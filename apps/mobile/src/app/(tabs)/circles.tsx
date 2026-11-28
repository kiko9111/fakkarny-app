import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { router, useNavigation } from "expo-router";
import type { Circle } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { t } from "@/i18n";
import { doseClock } from "@/care/clock";
import { circleStatus } from "@/circles/people";
import { listCircles, peekCare, peekCircle, peekCircles, peekTasks } from "@/lib/api";
import { failText } from "@/lib/errors";
import { useLive } from "@/lib/live";
import { Pressable, StyleSheet, View } from "react-native";
import { cacheRefreshed } from "@/lib/signals";
import { Button, Icon, IconTile, IntroPanel, LoadingCards, Note, palette, PersonAvatar, Rows, Screen, space, Text, useAddSheet } from "@/ui";

const newCircle = () => router.push("/circle/new");
/** Faces shown on a circle's row. */
const FACES = 3;

/** People: the user's circles. The header "+" makes one or takes an invite code. */
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

  // The line under a circle's name reads the saved copies: draw again when they were refreshed.
  const [, redraw] = useState(0);
  useEffect(() => cacheRefreshed.subscribe(() => redraw((n) => n + 1)), []);
  const tasks = peekTasks();
  const care = peekCare();

  // Reload whenever the tab comes back into view (after creating, joining or leaving).
  useLive(load);

  const add = useAddSheet([
    { key: "new", icon: "people-outline", kind: "people", label: t.circles.newTitle, onPress: newCircle },
    { key: "code", icon: "key-outline", kind: "neutral", label: t.ui.haveCode, onPress: () => router.push("/invite") },
  ]);
  const navigation = useNavigation();
  useLayoutEffect(() => navigation.setOptions(add.header), [navigation, add.header]);

  return (
    <Screen onRefresh={load}>
      {failed && circles === null ? (
        <>
          <Note icon="cloud-offline-outline">{failed}</Note>
          <Button label={t.lay.common.tryAgain} kind="text" size="sm" onPress={() => void load()} />
        </>
      ) : null}
      {circles === null && !failed ? <LoadingCards count={2} /> : null}
      <Rows>
        {(circles ?? []).map((c) => {
          const family = c.kind === "family";
          const tint = family ? palette.family : palette.friends;
          const soft = family ? palette.familySoft : palette.friendsSoft;
          const faces = (peekCircle(c.id)?.members ?? []).filter((m) => !m.is_me && m.name?.trim()).slice(0, FACES);
          const status = circleStatus(c.id, tasks, care);
          const line = status.needs ? fill(t.lay.circle.needsN, { n: status.needs }) : status.nextDoseTime ? fill(t.lay.circle.nextDose, { time: doseClock(status.nextDoseTime) }) : fill(t.ui.members, { n: c.member_count });
          return (
            <Pressable key={c.id} onPress={() => router.push({ pathname: "/circle/[id]", params: { id: c.id } })} accessibilityRole="button" accessibilityLabel={`${c.name}, ${line}`} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              {faces.length ? (
                <View style={styles.faces}>
                  {faces.map((m, i) => (
                    <View key={m.user_id} style={[styles.face, i > 0 && styles.overlap]}>
                      <PersonAvatar name={m.name ?? ""} size={32} color={tint} bg={soft} />
                    </View>
                  ))}
                </View>
              ) : (
                <IconTile name={family ? "home" : "people"} color={tint} bg={soft} size={40} />
              )}
              <View style={styles.flex}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {c.name}
                </Text>
                <Text variant={status.needs ? "smallStrong" : "small"} color={status.needs ? palette.primaryInk : palette.inkSoft} numberOfLines={1}>
                  {line}
                </Text>
              </View>
              <Icon name="chevron-forward" size={18} color={palette.inkFaint} />
            </Pressable>
          );
        })}
      </Rows>
      {circles !== null && circles.length === 0 ? <IntroPanel title={t.lay.tabs.peopleEmpty} action={t.circles.newTitle} onAction={newCircle} /> : null}
      {add.sheet}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 68 },
  pressed: { backgroundColor: palette.wash },
  flex: { flex: 1, minWidth: 0 },
  faces: { flexDirection: "row", alignItems: "center" },
  // A white ring keeps overlapping faces apart.
  face: { borderRadius: 18, borderWidth: 2, borderColor: palette.surfaceSolid },
  overlap: { marginStart: -12 },
});
