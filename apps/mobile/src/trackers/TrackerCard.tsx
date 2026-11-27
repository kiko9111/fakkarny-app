import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { TRACKER_TEMPLATES, type Tracker, type TrackerKind } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { parseAmount } from "@/daftar/logic";
import { t } from "@/i18n";
import { deleteTracker, logTracker, saveTracker, undoTracker, updateTracker } from "@/lib/api";
import { useGuess } from "@/lib/optimistic";
import { ask, Button, Card, confirm, fonts, Icon, IconButton, IconTile, notify, palette, plain, radius, space, Text, textStart, type IconName } from "@/ui";
import { QueuedOffline } from "@/sync/writes";
import { bumpTracker, formatNumber, monthBars, progress, weekBars } from "./logic";

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
  charity: "ribbon",
  custom: "create",
};

export const trackerName = (tr: Pick<Tracker, "kind" | "name">) => (tr.kind === "custom" ? tr.name ?? plain(t.trackers.kinds.custom) : plain(t.trackers.kinds[tr.kind]));

/**
 * Days in a row, small: a flame and the number, like the one in the chat's header. The words
 * ("5 days in a row") are read out, not drawn: written out, they took the room of the line
 * beside them and "Today's goal done" broke in two.
 */
export function TrackerStreak({ days }: { days: number }) {
  return (
    <View style={styles.streak} accessible accessibilityLabel={fill(t.ui.streakDays, { n: days })}>
      <Icon name="flame" size={14} color={palette.ok} />
      <Text variant="smallStrong" color={palette.ok}>
        {days}
      </Text>
    </View>
  );
}

/**
 * One thing the user follows: today's number, the week, and one-tap logging. A step shows at
 * once (the card's own guess, lib/optimistic.ts) and is sent behind; taps that follow each other
 * add up and go out in order, so three glasses are three quick taps.
 */
export function TrackerCard({ tracker: fromList, onChanged, onRemoved }: { tracker: Tracker; onChanged: (t: Tracker) => void; onRemoved: () => void }) {
  const { shown: tr, waiting, run: send } = useGuess(fromList);
  const [amountText, setAmountText] = useState("");
  const [showMonth, setShowMonth] = useState(false);
  const money = tr.unit === "money";
  const amount = parseAmount(amountText);

  const failed = () => notify(t.trackers.failed, "error");
  const log = (amount?: number) => {
    const step = amount ?? (TRACKER_TEMPLATES[tr.kind]?.step || 1);
    let guessed: Tracker | null = null;
    setAmountText("");
    void send(() => logTracker(fromList.id, amount), { next: (shown) => (guessed = bumpTracker(shown, step)), adopt: (answer) => answer, keep: (err) => err instanceof QueuedOffline }).then(onChanged, (err) => {
      if (!(err instanceof QueuedOffline)) return failed();
      // No connection: the step is kept on the phone and sent later, so the guess stays, here
      // and in the saved list every screen draws from.
      if (guessed) saveTracker(guessed);
      notify(t.trackers.savedOffline, "info");
    });
  };
  /** A change with nothing to show before the server answers (undo, stop sharing). */
  const run = (fn: () => Promise<Tracker>) => void send(fn, { adopt: (answer) => answer }).then(onChanged, failed);
  const menu = () =>
    tr.circle_id
      ? ask(trackerName(tr), undefined, [
          { label: t.trackers.unshare, onPress: () => run(() => updateTracker(tr.id, { circle_id: null })) },
          { label: t.trackers.remove, style: "destructive", onPress: remove },
          { label: t.trackers.no, style: "cancel" },
        ])
      : remove();
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
    <Card style={[styles.card, waiting ? styles.dim : {}]}>
      <View style={styles.head}>
        <IconTile name={TRACKER_ICON[tr.kind]} />
        <View style={styles.flex}>
          <Text variant="headline">{trackerName(tr)}</Text>
          <Text variant="small" color={palette.inkSoft}>
            {done ? t.ui.goalDone : sub}
          </Text>
        </View>
        {tr.streak >= 2 ? <TrackerStreak days={tr.streak} /> : null}
        <IconButton name="ellipsis-horizontal" label={t.trackers.remove} onPress={menu} size={36} />
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

      {tr.circle_name ? (
        <View style={styles.meta}>
          <Icon name="people-outline" size={14} color={palette.inkSoft} />
          <Text variant="small" color={palette.inkSoft}>
            {fill(t.trackers.sharedWith, { name: tr.circle_name })}
          </Text>
        </View>
      ) : null}

      {showMonth && tr.month.length ? (
        <View style={styles.monthBox} accessibilityLabel={t.trackers.month}>
          <Text variant="smallStrong" color={palette.inkSoft}>
            {t.trackers.month}
          </Text>
          <View style={styles.month}>
            {monthBars(tr).map((h, i, all) => (
              <View key={i} style={styles.barSlot}>
                <View style={[styles.bar, { height: 3 + Math.round(h * 53) }, i === all.length - 1 ? { backgroundColor: palette.primary } : h >= 1 ? { backgroundColor: palette.ok } : null]} />
              </View>
            ))}
          </View>
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
            <Button label={t.trackers.log} size="sm" disabled={amount === null} onPress={() => amount !== null && log(amount)} />
          </>
        ) : (
          <Button label={t.trackers.plusOne} size="sm" style={styles.plus} onPress={() => log()} />
        )}
        {tr.month.some((v) => v > 0) ? <Button label={showMonth ? t.trackers.hideMonth : t.trackers.showMonth} kind="text" size="sm" icon="stats-chart-outline" onPress={() => setShowMonth((v) => !v)} /> : null}
        {tr.total > 0 ? <Button label={t.trackers.undo} kind="text" size="sm" icon="arrow-undo-outline" disabled={waiting} onPress={() => run(() => undoTracker(tr.id))} /> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  dim: { opacity: 0.6 },
  flex: { flex: 1, minWidth: 0 },
  streak: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: palette.okSoft },
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
  numberRow: { flexDirection: "row", alignItems: "flex-end", gap: space.xs },
  week: { flexDirection: "row", gap: 4, height: 30, alignItems: "flex-end", width: 104 },
  barSlot: { flex: 1, justifyContent: "flex-end" },
  bar: { borderRadius: 3, backgroundColor: palette.lineStrong },
  meta: { flexDirection: "row", alignItems: "center", gap: 6 },
  monthBox: { gap: space.xs },
  month: { flexDirection: "row", gap: 2, height: 56, alignItems: "flex-end" },
  track: { height: 6, borderRadius: 3, backgroundColor: palette.surfaceAlt, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3 },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm },
  // The card's main tap: wide enough for a thumb though its label is two characters.
  plus: { minWidth: 76 },
  input: { flex: 1, minWidth: 100, minHeight: 40, backgroundColor: palette.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: space.lg, fontSize: 16, fontFamily: fonts.body, color: palette.ink },
});
