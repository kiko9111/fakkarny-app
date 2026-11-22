import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { TrackerKind } from "@fakkarni/shared";
import { parseAmount } from "@/daftar/logic";
import { t } from "@/i18n";
import { createTracker } from "@/lib/api";
import { HttpError } from "@/sync/queue";
import { TRACKER_ICON } from "@/trackers/TrackerCard";
import { Button, Chip, notify, palette, plain, Screen, space, Text, TextField, ZakiAvatar } from "@/ui";

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
      if (first) router.replace("/today");
      else router.back();
    } catch (err) {
      setBusy(false);
      // 402: the free tracker is already in use (a returning user sees the one they have).
      if (err instanceof HttpError && err.status === 402) router.replace(first ? "/today" : "/paywall");
      else notify(t.trackers.failed, "error");
    }
  };

  return (
    <Screen keyboard contentStyle={styles.content}>
      <Stack.Screen options={{ title: t.trackers.newTitle }} />
      <View style={styles.hero}>
        <ZakiAvatar size={64} glow />
        <Text variant="title" align="center">
          {plain(first ? t.trackers.firstTitle : t.trackers.pick)}
        </Text>
        {first ? (
          <Text variant="body" color={palette.inkSoft} align="center">
            {plain(t.trackers.firstHint)}
          </Text>
        ) : null}
      </View>
      <View style={styles.row}>
        {TrackerKind.options.map((k) => (
          <Chip key={k} icon={TRACKER_ICON[k]} label={plain(t.trackers.kinds[k])} selected={kind === k} onPress={() => setKind(k)} />
        ))}
      </View>
      {kind === "custom" ? <TextField value={name} onChangeText={setName} placeholder={t.trackers.customName} maxLength={40} autoFocus /> : null}
      {kind === "savings" ? <TextField value={goalText} onChangeText={setGoalText} placeholder={t.trackers.savingsGoal} keyboardType="decimal-pad" maxLength={12} /> : null}
      <Button label={t.trackers.start} size="lg" block busy={busy} disabled={!ready} onPress={() => void submit()} />
      {first ? <Button kind="text" label={t.trackers.later} onPress={() => router.replace("/")} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.lg },
  hero: { alignItems: "center", gap: space.sm, marginTop: space.sm },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, justifyContent: "center" },
});
