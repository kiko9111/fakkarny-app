import { useCallback, useState } from "react";
import { StyleSheet } from "react-native";
import { useFocusEffect } from "expo-router";
import type { Memory } from "@fakkarni/shared";
import { t } from "@/i18n";
import { deleteMemory, listMemories } from "@/lib/api";
import { Card, confirm, EmptyState, IconButton, IconTile, ListRow, notify, palette, plain, Screen, space } from "@/ui";

/** FR-4: the user can view and delete any memory. */
export default function MemoriesScreen() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMemories(await listMemories());
    } catch {
      notify(t.saved.offline, "error");
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const remove = (m: Memory) =>
    confirm(m.subject, t.memories.remove, () =>
      void deleteMemory(m.id)
        .then(() => setMemories((all) => all.filter((x) => x.id !== m.id)))
        .catch(() => notify(t.saved.offline, "error")),
    );

  return (
    <Screen onRefresh={() => void load()} refreshing={loading} contentStyle={styles.content}>
      {loaded && memories.length === 0 ? <EmptyState title={plain(t.memories.empty)} /> : null}
      {memories.length ? (
        <Card style={styles.list}>
          {memories.map((m) => (
            <ListRow
              key={m.id}
              leading={<IconTile name="bookmark-outline" size={40} />}
              title={m.subject}
              meta={m.content}
              trailing={<IconButton name="trash-outline" label={t.memories.remove} color={palette.inkSoft} onPress={() => remove(m)} />}
            />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  list: { paddingVertical: space.xs, paddingHorizontal: 0 },
});
