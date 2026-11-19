import { useCallback, useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, Text } from "react-native";
import { useFocusEffect } from "expo-router";
import type { Memory } from "@fakkarni/shared";
import { ItemRow } from "@/components/ItemRow";
import { t } from "@/i18n";
import { deleteMemory, listMemories } from "@/lib/api";
import { colors } from "@/lib/theme";

/** FR-4: the user can view and delete any memory. */
export default function MemoriesScreen() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMemories(await listMemories());
    } catch {
      Alert.alert(t.saved.offline);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      {!loading && memories.length === 0 ? <Text style={styles.empty}>{t.memories.empty}</Text> : null}
      {memories.map((m) => (
        <ItemRow
          key={m.id}
          title={m.subject}
          meta={m.content}
          action={t.memories.remove}
          onAction={() =>
            void deleteMemory(m.id)
              .then(() => setMemories((all) => all.filter((x) => x.id !== m.id)))
              .catch(() => Alert.alert(t.saved.offline))
          }
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 8 },
  empty: { color: colors.muted, textAlign: "center", marginTop: 40 },
});
