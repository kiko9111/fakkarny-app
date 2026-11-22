import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Redirect, router, Stack, useLocalSearchParams } from "expo-router";
import type { DaftarEntry } from "@fakkarni/shared";
import { DaftarCard } from "@/daftar/DaftarCard";
import { t } from "@/i18n";
import { openDaftar } from "@/lib/api";
import { prefs } from "@/lib/prefs";
import { unlock } from "@/lib/unlock-store";
import { EmptyState, palette, plain, space } from "@/ui";

/** Opened from a Daftar link (fakkarni://daftar/CODE): the entry appears in this person's Daftar. */
export default function OpenDaftarScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const [entry, setEntry] = useState<DaftarEntry | null>(null);
  const [failed, setFailed] = useState(false);
  const onboarded = prefs.get("onboarded") === "1";

  const load = useCallback(() => {
    openDaftar(code)
      .then((e) => {
        setEntry(e);
        unlock.open("daftar");
      })
      .catch(() => setFailed(true));
  }, [code]);

  useEffect(() => {
    if (onboarded) load();
  }, [load, onboarded]);

  if (!onboarded) return <Redirect href="/onboarding" />;

  return (
    <View style={styles.page}>
      <Stack.Screen options={{ title: t.daftar.title }} />
      {!entry && !failed ? <ActivityIndicator color={palette.primary} /> : null}
      {failed ? <EmptyState title={plain(t.daftar.notFound)} /> : null}
      {entry ? <DaftarCard entry={entry} onChanged={() => router.replace("/money")} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.bg, padding: space.lg, gap: space.md, justifyContent: "center" },
});
