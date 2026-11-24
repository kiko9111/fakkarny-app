import { Pressable, StyleSheet, View } from "react-native";
import type { Item } from "@fakkarni/shared";
import { t, dateLocale } from "@/i18n";
import { glass, Icon, palette, radius, shadow, space, Text } from "@/ui";

const when = (iso: string) => new Date(iso).toLocaleString(dateLocale, { weekday: "short", hour: "numeric", minute: "2-digit" });

/** One plan or reminder: a round check to finish it, the title, and when it is. */
export function PlanRow({ item, onDone }: { item: Item; onDone: () => void }) {
  return (
    <View style={styles.row}>
      <Pressable onPress={onDone} accessibilityRole="button" accessibilityLabel={`${t.upcoming.done}: ${item.title}`} hitSlop={8} style={({ pressed }) => [styles.check, pressed && styles.checkOn]}>
        {({ pressed }) => <Icon name="checkmark" size={18} color={pressed ? palette.onPrimary : palette.lineStrong} />}
      </Pressable>
      <View style={styles.text}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {item.title}
        </Text>
        {item.due_at ? (
          <View style={styles.meta}>
            <Icon name={item.alarm ? "alarm" : item.remind_at ? "alarm-outline" : "calendar-outline"} size={14} color={item.alarm ? palette.primaryInk : palette.inkSoft} />
            <Text variant="small" color={item.alarm ? palette.primaryInk : palette.inkSoft}>
              {when(item.alarm && item.remind_at ? item.remind_at : item.due_at)}
              {item.alarm ? ` · ${t.ui.alarm}` : ""}
            </Text>
          </View>
        ) : null}
      </View>
      {item.important ? <Icon name="star" size={18} color={palette.primary} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { ...glass, flexDirection: "row", alignItems: "center", gap: space.md, borderRadius: radius.lg, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 64 },
  check: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: palette.lineStrong, alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: palette.ok, borderColor: palette.ok },
  text: { flex: 1, minWidth: 0, gap: 2 },
  meta: { flexDirection: "row", alignItems: "center", gap: 4 },
});
