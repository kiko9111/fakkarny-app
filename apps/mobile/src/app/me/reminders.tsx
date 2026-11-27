import { StyleSheet, View } from "react-native";
import { router, Stack } from "expo-router";
import { dateLocale, t } from "@/i18n";
import { countLine } from "@/me/lines";
import { FieldGroup } from "@/me/parts";
import { useAlarms } from "@/me/useMe";
import { usePlaces } from "@/places/store";
import { Button, Icon, NavRow, palette, RowGroup, Screen, space, Text } from "@/ui";

const when = (iso: string) => new Date(iso).toLocaleString(dateLocale, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** Reminders and alarms: the alarms on this phone (Remove turns one off) and the saved places. */
export default function RemindersScreen() {
  const m = t.lay.me;
  const { alarms, remove } = useAlarms();
  const places = usePlaces();

  return (
    <Screen>
      <Stack.Screen options={{ title: m.reminders }} />

      <FieldGroup title={t.alarms.title}>
        {alarms.length === 0 ? (
          <Text variant="body" color={palette.inkSoft} style={styles.empty}>
            {m.alarmsNone}
          </Text>
        ) : (
          alarms.map((a, i) => {
            const at = a.remind_at ?? a.due_at;
            return (
              <View key={a.id} style={[styles.alarm, i > 0 && styles.line]}>
                <Icon name="alarm" size={22} color={palette.primaryInk} />
                <View style={styles.flex}>
                  <Text variant="bodyStrong" numberOfLines={2}>
                    {a.title}
                  </Text>
                  <Text variant="small" color={palette.inkSoft}>
                    {at ? when(at) : t.alarms.noTime}
                    {a.repeat_every_minutes === 1440 ? ` · ${t.alarms.daily}` : ""}
                  </Text>
                </View>
                <Button label={t.alarms.off} size="sm" kind="text" onPress={() => void remove(a)} />
              </View>
            );
          })
        )}
      </FieldGroup>

      {/* The full-screen alarm switch goes here, under the alarms, once its setting exists (none in the code yet). */}

      <RowGroup>
        <NavRow icon="location-outline" kind="place" title={t.places.row} value={countLine(places.length, m.placesOne, m.placesCount) ?? undefined} onPress={() => router.push("/places")} />
      </RowGroup>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  empty: { paddingVertical: space.lg },
  alarm: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 56, paddingVertical: space.md },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.lineStrong },
});
