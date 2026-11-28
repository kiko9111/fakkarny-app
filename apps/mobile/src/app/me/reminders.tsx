import { useEffect, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { router, Stack } from "expo-router";
import { dateLocale, t } from "@/i18n";
import { countLine } from "@/me/lines";
import { FieldGroup } from "@/me/parts";
import { useAlarms } from "@/me/useMe";
import { alarmStatus, fullScreenAlarms, openAlarmSetting, testAlarm } from "@/notifications";
import { notify } from "@/ui/feedback";
import { usePlaces } from "@/places/store";
import { pinWidget, widgetAvailable, widgetsPlaced } from "@/widget";
import { Button, IconTile, NavRow, palette, RowGroup, Screen, space, Text } from "@/ui";

const when = (iso: string) => new Date(iso).toLocaleString(dateLocale, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** Reminders and alarms: the alarms on this phone (Remove turns one off) and the saved places. */
export default function RemindersScreen() {
  const m = t.lay.me;
  const { alarms, remove } = useAlarms();
  const places = usePlaces();
  // What Android lets the full-screen alarm do; read again when the user comes back from Settings.
  const [alarmPerm, setAlarmPerm] = useState(alarmStatus);
  useEffect(() => {
    if (!fullScreenAlarms) return;
    const sub = AppState.addEventListener("change", (st) => st === "active" && setAlarmPerm(alarmStatus()));
    return () => sub.remove();
  }, []);

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
                <IconTile name="alarm-outline" kind="alarm" size={36} />
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

      {fullScreenAlarms ? (
        <View style={styles.perm}>
          {alarmPerm && !alarmPerm.exact ? <Button label={t.alarms.exactAllow} size="sm" kind="tonal" onPress={() => openAlarmSetting("exact")} /> : null}
          {alarmPerm && !alarmPerm.fullScreen ? <Button label={t.alarms.fullScreenAllow} size="sm" kind="tonal" onPress={() => openAlarmSetting("fullScreen")} /> : null}
          <Button
            label={t.alarms.test}
            size="sm"
            kind="text"
            onPress={() => {
              if (testAlarm(10)) notify(t.alarms.testSet);
            }}
          />
        </View>
      ) : null}

      <RowGroup>
        {/* The home-screen widget (Android builds with it): the launcher adds it, else how to. */}
        {widgetAvailable ? (
          <NavRow
            icon="apps-outline"
            kind="neutral"
            title={t.lay.widget.row}
            value={widgetsPlaced() > 0 ? t.lay.widget.placed : undefined}
            onPress={() => (pinWidget() ? undefined : notify(t.lay.widget.howTo))}
          />
        ) : null}
        <NavRow icon="location-outline" kind="place" title={t.places.row} value={countLine(places.length, m.placesOne, m.placesCount) ?? undefined} onPress={() => router.push("/places")} />
      </RowGroup>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  perm: { gap: space.sm, alignItems: "flex-start" },
  empty: { paddingVertical: space.lg },
  alarm: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 56, paddingVertical: space.md },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.lineStrong },
});
