import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import type { Tracker } from "@fakkarni/shared";
import { t } from "@/i18n";
import { Button, glass, Icon, IconTile, palette, radius, space, Text } from "@/ui";
import { TRACKER_ICON, trackerLine, trackerName, TrackerStreak, useTrackerLog } from "./TrackerCard";

/**
 * A tracker on Today, short: what it is, where today stands, and the one tap that logs a step.
 * The week, the month, undo and removing it are on the Trackers screen, which the row opens
 * (an amount of money is typed there too).
 */
export function TrackerRow({ tracker, onChanged }: { tracker: Tracker; onChanged: (t: Tracker) => void }) {
  const { tr, log } = useTrackerLog(tracker, onChanged);
  const { done, line } = trackerLine(tr);
  const open = () => router.push("/trackers");
  const name = trackerName(tr);
  return (
    <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`${name}, ${line}`} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <IconTile name={TRACKER_ICON[tr.kind]} size={40} />
      <View style={styles.text}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="small" color={done ? palette.ok : palette.inkSoft} numberOfLines={1}>
          {line}
        </Text>
      </View>
      {tr.streak >= 2 ? <TrackerStreak days={tr.streak} /> : null}
      {tr.unit === "money" ? (
        <Icon name="chevron-forward" size={18} color={palette.inkFaint} />
      ) : (
        <Button label={t.trackers.plusOne} size="sm" kind="tonal" style={styles.plus} onPress={() => log()} accessibilityLabel={`${t.trackers.plusOne}: ${name}`} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { ...glass, flexDirection: "row", alignItems: "center", gap: space.md, borderRadius: radius.lg, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 64 },
  pressed: { backgroundColor: palette.wash },
  text: { flex: 1, minWidth: 0, gap: 2 },
  plus: { minWidth: 64 },
});
