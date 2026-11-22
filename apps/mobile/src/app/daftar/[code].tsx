import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Redirect, router, Stack, useLocalSearchParams } from "expo-router";
import type { DaftarEntry } from "@fakkarni/shared";
import { DaftarCard } from "@/daftar/DaftarCard";
import { t } from "@/i18n";
import { openDaftar } from "@/lib/api";
import { prefs } from "@/lib/prefs";
import { colors } from "@/lib/theme";

/** Opened from a Daftar link (fakkarni://daftar/CODE): the entry appears in this person's Daftar. */
export default function OpenDaftarScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const [entry, setEntry] = useState<DaftarEntry | null>(null);
  const [failed, setFailed] = useState(false);
  const onboarded = prefs.get("onboarded") === "1";

  const load = useCallback(() => {
    openDaftar(code)
      .then(setEntry)
      .catch(() => setFailed(true));
  }, [code]);

  useEffect(() => {
    if (onboarded) load();
  }, [load, onboarded]);

  if (!onboarded) return <Redirect href="/onboarding" />;

  return (
    <View style={styles.page}>
      <Stack.Screen options={{ title: t.daftar.title }} />
      {!entry && !failed ? <ActivityIndicator color={colors.accent} /> : null}
      {failed ? <Text style={styles.body}>{t.daftar.notFound}</Text> : null}
      {entry ? <DaftarCard entry={entry} onChanged={() => router.replace("/money")} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, padding: 16, gap: 12, justifyContent: "center" },
  body: { fontSize: 15, color: colors.muted, textAlign: "center" },
});
