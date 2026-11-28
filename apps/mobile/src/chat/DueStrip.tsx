import { useEffect, useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";
import { doseClock } from "@/care/clock";
import { fill } from "@/circles/logic";
import { t } from "@/i18n";
import { peekCare } from "@/lib/api";
import { cacheRefreshed, dataChanged } from "@/lib/signals";
import { useUnlocked } from "@/lib/unlock-store";
import { nextLine } from "@/today/glance";
import { needsChanged, useNeedsYouCount } from "@/today/useNeeds";
import { glass, Icon, palette, space, Text } from "@/ui";

/** The next dose still to come today, as its clock time, from the saved copy. */
const nextDoseTime = (): string | null => nextLine({ care: peekCare() }, { dose: "{time}", turn: "", clock: doseClock })?.text ?? null;

/**
 * One slim line under the chat's header while something is due: how much waits for the reader and
 * the next dose today. It opens Today and is not there when nothing is due. Saved copies only.
 */
export function DueStrip() {
  const needs = useNeedsYouCount();
  // Like the tab's badge: nothing about Today before Zaki has introduced it.
  const known = useUnlocked().includes("today");
  const [dose, setDose] = useState(nextDoseTime);
  useEffect(() => {
    const read = () => setDose(nextDoseTime());
    const offs = [cacheRefreshed.subscribe(read), dataChanged.subscribe(read), needsChanged.subscribe(read)];
    return () => offs.forEach((off) => off());
  }, []);
  const text = [needs ? fill(t.lay.chat.dueNeeds, { n: needs }) : "", dose ? fill(t.lay.chat.dueDose, { time: dose }) : ""].filter(Boolean).join(" · ");
  if (!text || !known) return null;
  return (
    <Pressable onPress={() => router.navigate("/today")} accessibilityRole="button" accessibilityLabel={`${t.lay.common.today}: ${text}`} style={({ pressed }) => [styles.strip, pressed && styles.pressed]}>
      <Icon name="sunny-outline" size={15} color={palette.primaryInk} />
      <Text variant="smallStrong" numberOfLines={1} style={styles.text}>
        {text}
      </Text>
      <Icon name="chevron-forward" size={15} color={palette.inkFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  strip: { ...glass, flexDirection: "row", alignItems: "center", gap: space.sm, marginHorizontal: space.md, marginTop: space.xs, paddingHorizontal: space.md, minHeight: 40, borderRadius: 14 },
  pressed: { backgroundColor: palette.surfaceSolid },
  text: { flex: 1, minWidth: 0 },
});
