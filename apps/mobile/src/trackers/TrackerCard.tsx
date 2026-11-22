import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import type { Tracker, TrackerKind } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { parseAmount } from "@/daftar/logic";
import { t } from "@/i18n";
import { deleteTracker, logTracker, undoTracker } from "@/lib/api";
import { Badge, Button, Card, confirm, fonts, IconButton, IconTile, notify, palette, plain, radius, space, Text, textStart, type IconName } from "@/ui";
import { formatNumber, progress, weekBars } from "./logic";

export const TRACKER_ICON: Record<TrackerKind, IconName> = {
  water: "water",
  prayer: "compass",
  gym: "barbell",
  quran: "book",
  medicine: "medkit",
  study: "school",
  spending: "receipt",
  savings: "wallet",
  fasting: "moon",
  charity: "heart",
  custom: "create",
};

export const trackerName = (tr: Pick<Tracker, "kind" | "name">) => (tr.kind === "custom" ? tr.name ?? plain(t.trackers.kinds.custom) : plain(t.trackers.kinds[tr.kind]));

/** One thing the user follows: today's number, the week, and one-tap logging. */
export function TrackerCard({ tracker: tr, onChanged, onRemoved }: { tracker: Tracker; onChanged: (t: Tracker) => void; onRemoved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [amountText, setAmountText] = useState("");
  const money = tr.unit === "money";
  const amount = parseAmount(amountText);

  const run = async (fn: () => Promise<Tracker>) => {
    if (busy) return;
    setBusy(true);
    try {
      onChanged(await fn());
      setAmountText("");
    } catch {
      notify(t.trackers.failed, "error");
    } finally {
      setBusy(false);
    }
  };
  const remove = () =>
    confirm(t.trackers.removeConfirm, t.trackers.yes, () =>
      void deleteTracker(tr.id)
        .then(onRemoved)
        .catch(() => notify(t.trackers.failed, "error")),
      t.trackers.no,
    );

  const p = progress(tr);
  const done = p !== null && p >= 1 && !tr.cumulative;
  const big = money ? formatNumber(tr.cumulative ? tr.total : tr.today) : formatNumber(tr.today);
  const sub = money
    ? tr.cumulative
      ? tr.goal
        ? fill(t.trackers.ofGoal, { n: formatNumber(tr.total), goal: formatNumber(tr.goal) })
        : t.ui.pounds.replace("{n}", "").trim()
      : fill(t.trackers.todayMoney, { n: formatNumber(tr.today) })
    : tr.goal
      ? fill(t.trackers.ofGoalToday, { n: formatNumber(tr.today), goal: formatNumber(tr.goal) })
      : fill(t.trackers.today, { n: formatNumber(tr.today) });
  const bars = weekBars(tr);

  return (
    <Card style={[styles.card, busy ? styles.dim : {}]}>
      <View style={styles.head}>
        <IconTile name={TRACKER_ICON[tr.kind]} />
        <View style={styles.flex}>
          <Text variant="headline">{trackerName(tr)}</Text>
          <Text variant="small" color={palette.inkSoft}>
            {done ? t.ui.goalDone : sub}
          </Text>
        </View>
        {tr.streak >= 2 ? <Badge label={fill(t.ui.streakDays, { n: tr.streak })} tone="ok" /> : null}
        <IconButton name="ellipsis-horizontal" label={t.trackers.remove} onPress={remove} size={36} />
      </View>

      <View style={styles.numberRow}>
        <Text variant="number" color={done ? palette.ok : palette.ink}>
          {big}
        </Text>
        {tr.goal && !money ? (
          <Text variant="headline" color={palette.inkFaint}>
            / {formatNumber(tr.goal)}
          </Text>
        ) : null}
        <View style={styles.flex} />
        <View style={styles.week} accessibilityLabel={t.ui.week}>
          {bars.map((h, i) => (
            <View key={i} style={styles.barSlot}>
              <View style={[styles.bar, { height: 4 + Math.round(h * 26) }, i === 6 ? { backgroundColor: done ? palette.ok : palette.primary } : null]} />
            </View>
          ))}
        </View>
      </View>
      {p !== null ? (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(Math.min(1, p) * 100)}%`, backgroundColor: done ? palette.ok : palette.primary }]} />
        </View>
      ) : null}

      <View style={styles.actions}>
        {money ? (
          <>
            <TextInput
              style={styles.input}
              value={amountText}
              onChangeText={setAmountText}
              placeholder={t.trackers.amount}
              placeholderTextColor={palette.inkFaint}
              keyboardType="decimal-pad"
              maxLength={12}
              textAlign={textStart}
            />
            <Button label={t.trackers.log} size="sm" disabled={busy || amount === null} onPress={() => amount !== null && void run(() => logTracker(tr.id, amount))} />
          </>
        ) : (
          <Button label={t.trackers.plusOne} icon="add" size="sm" disabled={busy} onPress={() => void run(() => logTracker(tr.id))} />
        )}
        {tr.total > 0 ? <Button label={t.trackers.undo} kind="text" size="sm" icon="arrow-undo-outline" disabled={busy} onPress={() => void run(() => undoTracker(tr.id))} /> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  dim: { opacity: 0.6 },
  flex: { flex: 1, minWidth: 0 },
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
  numberRow: { flexDirection: "row", alignItems: "flex-end", gap: space.xs },
  week: { flexDirection: "row", gap: 4, height: 30, alignItems: "flex-end", width: 104 },
  barSlot: { flex: 1, justifyContent: "flex-end" },
  bar: { borderRadius: 3, backgroundColor: palette.lineStrong },
  track: { height: 6, borderRadius: 3, backgroundColor: palette.surfaceAlt, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3 },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm },
  input: { flex: 1, minWidth: 100, minHeight: 40, backgroundColor: palette.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: space.lg, fontSize: 16, fontFamily: fonts.body, color: palette.ink },
});
