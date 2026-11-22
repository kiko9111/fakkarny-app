import { useCallback, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import type { Tracker } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { parseAmount } from "@/daftar/logic";
import { t } from "@/i18n";
import { deleteTracker, listTrackers, logTracker, undoTracker } from "@/lib/api";
import { colors } from "@/lib/theme";
import { canAdd, formatNumber, progress, weekBars } from "@/trackers/logic";

/** The trackers dashboard: what the user follows, filled from chat and from one tap here. */
export default function TrackersScreen() {
  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [limit, setLimit] = useState<number | null>(1);
  const [state, setState] = useState<"loading" | "ready" | "offline">("loading");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await listTrackers();
      setTrackers(res.trackers);
      setLimit(res.limit);
      setState("ready");
    } catch {
      setState((s) => (s === "ready" ? s : "offline"));
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const replace = (next: Tracker) => setTrackers((all) => all.map((x) => (x.id === next.id ? next : x)));
  const add = () => (canAdd(trackers.length, limit) ? router.push("/tracker/new") : router.push("/paywall"));

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load().finally(() => setRefreshing(false));
          }}
        />
      }
    >
      <Pressable style={styles.sessionCard} onPress={() => router.push("/session")} accessibilityRole="button">
        <Text style={styles.sessionText}>{t.session.entry}</Text>
      </Pressable>
      {state === "offline" ? <Text style={styles.empty}>{t.trackers.offline}</Text> : null}
      {state === "ready" && trackers.length === 0 ? <Text style={styles.empty}>{t.trackers.empty}</Text> : null}
      {trackers.map((tr) => (
        <TrackerCard key={tr.id} tracker={tr} onChanged={replace} onRemoved={() => void load()} />
      ))}
      {state === "ready" ? (
        <Pressable style={styles.add} onPress={add} accessibilityRole="button">
          <Text style={styles.addText}>{canAdd(trackers.length, limit) ? t.trackers.add : t.trackers.addPro}</Text>
        </Pressable>
      ) : null}
      {state === "ready" && trackers.length > 0 ? <Text style={styles.hint}>{t.trackers.chatHint}</Text> : null}
    </ScrollView>
  );
}

function TrackerCard({ tracker: tr, onChanged, onRemoved }: { tracker: Tracker; onChanged: (t: Tracker) => void; onRemoved: () => void }) {
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
      Alert.alert(t.trackers.failed);
    } finally {
      setBusy(false);
    }
  };
  const remove = () =>
    Alert.alert(t.trackers.removeConfirm, undefined, [
      { text: t.trackers.no, style: "cancel" },
      {
        text: t.trackers.yes,
        style: "destructive",
        onPress: () =>
          void deleteTracker(tr.id)
            .then(onRemoved)
            .catch(() => Alert.alert(t.trackers.failed)),
      },
    ]);

  const p = progress(tr);
  const main = money
    ? tr.cumulative
      ? tr.goal
        ? fill(t.trackers.ofGoal, { n: formatNumber(tr.total), goal: formatNumber(tr.goal) })
        : formatNumber(tr.total)
      : fill(t.trackers.todayMoney, { n: formatNumber(tr.today) })
    : tr.goal
      ? fill(t.trackers.ofGoalToday, { n: formatNumber(tr.today), goal: formatNumber(tr.goal) })
      : fill(t.trackers.today, { n: formatNumber(tr.today) });

  return (
    <View style={[styles.card, busy && styles.dim]}>
      <View style={styles.head}>
        <Text style={styles.name}>{tr.kind === "custom" ? tr.name ?? t.trackers.kinds.custom : t.trackers.kinds[tr.kind]}</Text>
        {tr.streak >= 2 ? <Text style={styles.streak}>{fill(t.trackers.streak, { n: tr.streak })}</Text> : null}
      </View>
      <Text style={styles.main}>{main}</Text>
      {p !== null ? (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(p * 100)}%` }]} />
        </View>
      ) : null}
      <View style={styles.week}>
        {weekBars(tr).map((h, i) => (
          <View key={i} style={styles.barSlot}>
            <View style={[styles.bar, { height: 4 + Math.round(h * 28) }, i === 6 && styles.barToday]} />
          </View>
        ))}
      </View>
      <View style={styles.actions}>
        {money ? (
          <>
            <TextInput style={styles.input} value={amountText} onChangeText={setAmountText} placeholder={t.trackers.amount} keyboardType="decimal-pad" maxLength={12} />
            <Pressable style={[styles.action, styles.primary, amount === null && styles.dim]} disabled={busy || amount === null} onPress={() => amount !== null && void run(() => logTracker(tr.id, amount))} accessibilityRole="button">
              <Text style={styles.primaryText}>{t.trackers.log}</Text>
            </Pressable>
          </>
        ) : (
          <Pressable style={[styles.action, styles.primary]} disabled={busy} onPress={() => void run(() => logTracker(tr.id))} accessibilityRole="button">
            <Text style={styles.primaryText}>{t.trackers.plusOne}</Text>
          </Pressable>
        )}
        {tr.total > 0 ? (
          <Pressable style={styles.action} disabled={busy} onPress={() => void run(() => undoTracker(tr.id))} accessibilityRole="button">
            <Text style={styles.actionText}>{t.trackers.undo}</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.quiet} onPress={remove} accessibilityRole="button">
          <Text style={styles.quietText}>{t.trackers.remove}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12 },
  empty: { color: colors.muted, textAlign: "center", marginTop: 40, fontSize: 15, lineHeight: 22 },
  hint: { color: colors.muted, textAlign: "center", fontSize: 13, lineHeight: 20 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, gap: 8 },
  dim: { opacity: 0.6 },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { flex: 1, fontSize: 16, fontWeight: "600", color: colors.text, textAlign: "left" },
  streak: { fontSize: 13, color: colors.ok, fontWeight: "600" },
  main: { fontSize: 22, fontWeight: "700", color: colors.text, textAlign: "left" },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.bg, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
  week: { flexDirection: "row", gap: 6, height: 34, alignItems: "flex-end" },
  barSlot: { flex: 1, justifyContent: "flex-end" },
  bar: { borderRadius: 3, backgroundColor: colors.muted, opacity: 0.4 },
  barToday: { backgroundColor: colors.accent, opacity: 1 },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  input: { flex: 1, minWidth: 90, backgroundColor: colors.bg, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6, fontSize: 16, color: colors.text },
  action: { borderWidth: 1, borderColor: colors.accent, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8 },
  actionText: { color: colors.accent, fontWeight: "600" },
  primary: { backgroundColor: colors.accent },
  primaryText: { color: "#fff", fontWeight: "700" },
  quiet: { marginStart: "auto", paddingVertical: 8 },
  quietText: { color: colors.muted, fontSize: 13 },
  sessionCard: { backgroundColor: "#fff", borderRadius: 14, padding: 14 },
  sessionText: { color: colors.text, fontSize: 15, fontWeight: "600", textAlign: "left" },
  add: { borderWidth: 1, borderColor: colors.accent, borderRadius: 16, paddingVertical: 12, alignItems: "center" },
  addText: { color: colors.accent, fontSize: 16, fontWeight: "700" },
});
