import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { dateLocale, isRTL, t } from "@/i18n";
import { addMonths, atTime, defaultPick, from12, monthGrid, pastDay, sameDay, to12 } from "@/lib/calendar";
import { Button, IconButton } from "./Button";
import { Icon } from "./Icon";
import { Text } from "./Text";
import { glass, palette, radius, space } from "./tokens";

/** Weeks start on Saturday in Egypt; Sunday in English. */
const WEEK_START = isRTL ? 6 : 0;
const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = [0, 10, 15, 20, 30, 40, 45, 50];

export const formatPick = (d: Date) => d.toLocaleString(dateLocale, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/**
 * A calendar and a clock, all in JavaScript (no native picker, so it reaches existing builds
 * over the air). Past days are greyed out; a time already gone today can't be confirmed.
 */
export function DateTimePicker({ initial, onDone, onCancel, confirmLabel }: { initial?: Date | null; onDone: (d: Date) => void; onCancel: () => void; confirmLabel?: string }) {
  const now = new Date();
  const start = initial && initial.getTime() > now.getTime() ? initial : defaultPick(now);
  const [day, setDay] = useState(new Date(start.getFullYear(), start.getMonth(), start.getDate()));
  const [view, setView] = useState({ year: start.getFullYear(), month: start.getMonth() });
  const [hour, setHour] = useState(start.getHours());
  const [minute, setMinute] = useState(MINUTES.includes(start.getMinutes()) ? start.getMinutes() : 0);
  const picked = atTime(day, hour, minute);
  const past = picked.getTime() <= now.getTime();
  const { h, pm } = to12(hour);
  const weekdays = monthGrid(2026, 10, WEEK_START)[1]!.map((d) => d!.toLocaleDateString(dateLocale, { weekday: "narrow" }));
  const atFirstMonth = view.year === now.getFullYear() && view.month === now.getMonth();

  return (
    <View style={styles.box}>
      <View style={styles.head}>
        <IconButton name="chevron-back" label={t.picker.prevMonth} disabled={atFirstMonth} onPress={() => setView((v) => addMonths(v.year, v.month, -1))} />
        <Text variant="headline">{new Date(view.year, view.month, 1).toLocaleDateString(dateLocale, { month: "long", year: "numeric" })}</Text>
        <IconButton name="chevron-forward" label={t.picker.nextMonth} onPress={() => setView((v) => addMonths(v.year, v.month, 1))} />
      </View>
      <View style={styles.week}>
        {weekdays.map((w, i) => (
          <Text key={i} variant="caption" color={palette.inkSoft} align="center" style={styles.cell}>
            {w}
          </Text>
        ))}
      </View>
      {monthGrid(view.year, view.month, WEEK_START).map((week, i) => (
        <View key={i} style={styles.week}>
          {week.map((d, j) => {
            if (!d) return <View key={j} style={styles.cell} />;
            const off = pastDay(d, now);
            const on = sameDay(d, day);
            const today = sameDay(d, now);
            return (
              <Pressable
                key={j}
                disabled={off}
                onPress={() => setDay(d)}
                accessibilityRole="button"
                accessibilityState={{ selected: on, disabled: off }}
                accessibilityLabel={d.toLocaleDateString(dateLocale, { weekday: "long", day: "numeric", month: "long" })}
                style={[styles.cell, styles.day, on && styles.dayOn, today && !on && styles.today]}
              >
                <Text variant={on ? "smallStrong" : "small"} color={on ? palette.onPrimary : off ? palette.lineStrong : palette.ink} align="center">
                  {d.getDate()}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}

      <View style={styles.timeHead}>
        <Icon name="time-outline" size={16} color={palette.inkSoft} />
        <Text variant="smallStrong" color={palette.inkSoft}>
          {t.picker.time}
        </Text>
      </View>
      <View style={styles.grid}>
        {HOURS.map((x) => (
          <Pill key={x} label={String(x)} on={x === h} onPress={() => setHour(from12(x, pm))} />
        ))}
      </View>
      <View style={styles.grid}>
        <Pill wide label={t.picker.am} on={!pm} onPress={() => setHour(from12(h, false))} />
        <Pill wide label={t.picker.pm} on={pm} onPress={() => setHour(from12(h, true))} />
      </View>
      <View style={styles.grid}>
        {MINUTES.map((m) => (
          <Pill key={m} mid label={`:${String(m).padStart(2, "0")}`} on={m === minute} onPress={() => setMinute(m)} />
        ))}
      </View>

      <Text variant="bodyStrong" align="center" color={past ? palette.danger : palette.ink}>
        {past ? t.picker.past : formatPick(picked)}
      </Text>
      <View style={styles.actions}>
        <Button label={t.ui.cancel} kind="text" size="sm" onPress={onCancel} />
        <Button label={confirmLabel ?? t.picker.done} size="sm" icon="checkmark" disabled={past} onPress={() => onDone(picked)} />
      </View>
    </View>
  );
}

function Pill({ label, on, onPress, wide, mid }: { label: string; on: boolean; onPress: () => void; wide?: boolean; mid?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.pill, wide && styles.pillWide, mid && styles.pillMid, on && styles.dayOn]}>
      <Text variant="smallStrong" color={on ? palette.onPrimary : palette.ink} align="center">
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { ...glass, borderRadius: radius.lg, padding: space.md, gap: space.xs },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  week: { flexDirection: "row" },
  cell: { flex: 1, minHeight: 38, alignItems: "center", justifyContent: "center" },
  day: { borderRadius: 19, margin: 1 },
  dayOn: { backgroundColor: palette.primary, borderColor: palette.primary },
  today: { borderWidth: 1.5, borderColor: palette.primary },
  timeHead: { flexDirection: "row", alignItems: "center", gap: space.xs, marginTop: space.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, justifyContent: "center" },
  pill: { minWidth: 44, minHeight: 36, paddingHorizontal: space.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: palette.line, alignItems: "center", justifyContent: "center", backgroundColor: palette.surfaceStrong },
  pillWide: { minWidth: 96 },
  pillMid: { minWidth: 68 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: space.sm, marginTop: space.xs },
});
