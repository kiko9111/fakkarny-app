import { Pressable, StyleSheet, View } from "react-native";
import type { Item } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { t, dateLocale } from "@/i18n";
import { planTimes } from "@/lib/plan-time";
import { glass, Icon, palette, radius, shadow, space, Text } from "@/ui";

const when = (iso: string) => new Date(iso).toLocaleString(dateLocale, { weekday: "short", hour: "numeric", minute: "2-digit" });
const clock = (iso: string) => new Date(iso).toLocaleTimeString(dateLocale, { hour: "numeric", minute: "2-digit" });
const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();

/** One plan or reminder: a round check to finish it, the title, and when it is (and when Zaki reminds). */
export function PlanRow({ item, onDone }: { item: Item; onDone: () => void }) {
  const { main, reminder } = planTimes(item);
  const ink = item.alarm ? palette.primaryInk : palette.inkSoft;
  const reminderText = reminder && main ? (sameDay(reminder, main) ? clock(reminder) : when(reminder)) : null;
  return (
    <View style={styles.row}>
      <Pressable onPress={onDone} accessibilityRole="button" accessibilityLabel={`${t.upcoming.done}: ${item.title}`} hitSlop={8} style={({ pressed }) => [styles.check, pressed && styles.checkOn]}>
        {({ pressed }) => <Icon name="checkmark" size={18} color={pressed ? palette.onPrimary : palette.lineStrong} />}
      </Pressable>
      <View style={styles.text}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {item.title}
        </Text>
        {main ? (
          <View style={styles.meta}>
            <Icon name={item.alarm ? "alarm" : item.remind_at && !reminder ? "alarm-outline" : "calendar-outline"} size={14} color={ink} />
            <Text variant="small" color={ink}>
              {when(main)}
              {item.alarm ? ` · ${t.ui.alarm}` : ""}
            </Text>
            {reminderText ? (
              <View style={styles.reminder} accessible accessibilityLabel={fill(t.tasks.remindLine, { when: reminderText })}>
                <Icon name="alarm-outline" size={14} color={palette.inkSoft} />
                <Text variant="small" color={palette.inkSoft}>
                  {reminderText}
                </Text>
              </View>
            ) : null}
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
  meta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4 },
  reminder: { flexDirection: "row", alignItems: "center", gap: 4, marginStart: space.sm },
});
