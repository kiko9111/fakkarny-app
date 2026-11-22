import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { TrackerKind } from "@fakkarni/shared";
import { parseAmount } from "@/daftar/logic";
import { t } from "@/i18n";
import { createTracker } from "@/lib/api";
import { colors } from "@/lib/theme";
import { HttpError } from "@/sync/queue";

/**
 * Pick what to follow. Shown once after sign-up (`first`), where the first tracker is
 * Zaki's gift, and from the Trackers tab afterwards.
 */
export default function NewTrackerScreen() {
  const { first } = useLocalSearchParams<{ first?: string }>();
  const [kind, setKind] = useState<TrackerKind | null>(null);
  const [name, setName] = useState("");
  const [goalText, setGoalText] = useState("");
  const [busy, setBusy] = useState(false);
  const goal = parseAmount(goalText);
  const ready = kind !== null && (kind !== "custom" || name.trim().length > 0) && (goalText.trim() === "" || goal !== null);

  const submit = async () => {
    if (!ready || busy || !kind) return;
    setBusy(true);
    try {
      await createTracker({ kind, ...(kind === "custom" ? { name: name.trim() } : {}), ...(goal !== null ? { goal } : {}) });
      if (first) router.replace("/trackers");
      else router.back();
    } catch (err) {
      setBusy(false);
      // 402: the free tracker is already in use (a returning user sees the one they have).
      if (err instanceof HttpError && err.status === 402) router.replace(first ? "/trackers" : "/paywall");
      else Alert.alert(t.trackers.failed);
    }
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: t.trackers.newTitle }} />
      <Text style={styles.title}>{first ? t.trackers.firstTitle : t.trackers.pick}</Text>
      {first ? <Text style={styles.hint}>{t.trackers.firstHint}</Text> : null}
      <View style={styles.row}>
        {TrackerKind.options.map((k) => (
          <Pressable key={k} style={[styles.chip, kind === k && styles.chipOn]} onPress={() => setKind(k)} accessibilityRole="button">
            <Text style={[styles.chipText, kind === k && styles.chipTextOn]}>{t.trackers.kinds[k]}</Text>
          </Pressable>
        ))}
      </View>
      {kind === "custom" ? <TextInput style={styles.input} value={name} onChangeText={setName} placeholder={t.trackers.customName} maxLength={40} /> : null}
      {kind === "savings" ? <TextInput style={styles.input} value={goalText} onChangeText={setGoalText} placeholder={t.trackers.savingsGoal} keyboardType="decimal-pad" maxLength={12} /> : null}
      <Pressable style={[styles.primary, (!ready || busy) && styles.dim]} disabled={!ready || busy} onPress={() => void submit()} accessibilityRole="button">
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{t.trackers.start}</Text>}
      </Pressable>
      {first ? (
        <Pressable onPress={() => router.replace("/")} accessibilityRole="button">
          <Text style={styles.skip}>{t.trackers.later}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 24, gap: 14 },
  title: { fontSize: 20, fontWeight: "700", color: colors.text, textAlign: "center" },
  hint: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: "center" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  chip: { borderWidth: 1, borderColor: colors.accent, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  chipOn: { backgroundColor: colors.accent },
  chipText: { color: colors.accent, fontWeight: "600", fontSize: 15 },
  chipTextOn: { color: "#fff" },
  input: { backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 17, color: colors.text, writingDirection: "auto" },
  primary: { backgroundColor: colors.accent, borderRadius: 16, paddingVertical: 14, alignItems: "center" },
  primaryText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  dim: { opacity: 0.5 },
  skip: { color: colors.muted, textAlign: "center", fontSize: 14, paddingVertical: 8 },
});
