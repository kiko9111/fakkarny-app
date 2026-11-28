import { Pressable, StyleSheet, View } from "react-native";
import type { Item } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { t, dateLocale } from "@/i18n";
import { planTimes } from "@/lib/plan-time";
import { dayOf } from "@/today/glance";
import { glass, Icon, IconTile, palette, radius, space, Text } from "@/ui";

const clock = (iso: string) => new Date(iso).toLocaleTimeString(dateLocale, { hour: "numeric", minute: "2-digit" });
/** Today says the clock alone, tomorrow its word, any other day the weekday. */
const when = (iso: string) => {
  const day = dayOf(iso, new Date());
  if (day === "today") return clock(iso);
  if (day === "tomorrow") return `${t.lay.today.tomorrow} ${clock(iso)}`;
  return new Date(iso).toLocaleString(dateLocale, { weekday: "short", hour: "numeric", minute: "2-digit" });
};
const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();

/**
 * One plan in Today and Plans: a round check to finish it, the title, when it is (and when Zaki
 * reminds, if apart), the place for a place reminder, and at the end a violet alarm square when it rings as an alarm
 * or a blue pin when it waits for a place.
 */
export function PlanRow({ item, onDone, flat, late }: { item: Item; onDone: () => void; flat?: boolean; late?: boolean }) {
  const { main, reminder } = planTimes(item);
  const reminderText = reminder && main ? (sameDay(reminder, main) ? clock(reminder) : when(reminder)) : null;
  const place = item.place?.trim() || null;
  return (
    <View style={flat ? styles.flat : styles.row}>
      <Pressable onPress={onDone} accessibilityRole="button" accessibilityLabel={`${t.upcoming.done}: ${item.title}`} hitSlop={9} style={({ pressed }) => [styles.check, pressed && styles.checkOn]}>
        {({ pressed }) => <Icon name="checkmark" size={18} color={pressed ? palette.onPrimary : palette.lineStrong} />}
      </Pressable>
      <View style={styles.text}>
        <Text variant="bodyStrong" numberOfLines={flat ? 1 : 2}>
          {item.title}
        </Text>
        {main || place ? (
          <View style={styles.meta}>
            {main ? (
              <View style={styles.bit}>
                <Icon name={late ? "alert-circle-outline" : item.remind_at && !reminder ? "alarm-outline" : "calendar-outline"} size={14} color={late ? palette.danger : palette.inkSoft} />
                <Text variant={late ? "smallStrong" : "small"} color={late ? palette.danger : palette.inkSoft}>
                  {late ? `${t.lay.today.late} · ${when(main)}` : when(main)}
                </Text>
              </View>
            ) : null}
            {reminderText ? (
              <View style={styles.bit} accessible accessibilityLabel={fill(t.tasks.remindLine, { when: reminderText })}>
                <Icon name="alarm-outline" size={14} color={palette.inkSoft} />
                <Text variant="small" color={palette.inkSoft}>
                  {reminderText}
                </Text>
              </View>
            ) : null}
            {place ? (
              <View style={[styles.bit, styles.place]} accessible accessibilityLabel={fill(t.lay.today.atPlace, { place })}>
                <Icon name="location-outline" size={14} color={palette.inkSoft} />
                <Text variant="small" color={palette.inkSoft} numberOfLines={1} style={styles.placeName}>
                  {place}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      {item.alarm ? (
        <View accessible accessibilityRole="image" accessibilityLabel={t.ui.alarm}>
          <IconTile name="alarm" kind="alarm" size={32} />
        </View>
      ) : place ? (
        <IconTile name="location" kind="place" size={32} />
      ) : null}
      {item.important ? <Icon name="star" size={18} color={palette.primary} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { ...glass, flexDirection: "row", alignItems: "center", gap: space.md, borderRadius: radius.lg, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 64 },
  flat: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm, minHeight: 60 },
  check: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: palette.lineStrong, alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: palette.ok, borderColor: palette.ok },
  text: { flex: 1, minWidth: 0, gap: 2 },
  meta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: space.md, rowGap: 2 },
  bit: { flexDirection: "row", alignItems: "center", gap: 4 },
  place: { flexShrink: 1, minWidth: 0 },
  placeName: { flexShrink: 1 },
});
