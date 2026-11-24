import { useCallback, useState } from "react";
import { StyleSheet } from "react-native";
import { useFocusEffect } from "expo-router";
import type { Memory } from "@fakkarni/shared";
import { t } from "@/i18n";
import { deleteMemory, listMemories, peekMemories } from "@/lib/api";
import { Card, confirm, EmptyState, IconButton, IconTile, ListRow, notify, palette, plain, Screen, space } from "@/ui";

/** FR-4: the user can view and delete any memory. */
export default function MemoriesScreen() {
  // Starts from the saved copy, so the list shows at once and refreshes behind.
  const [memories, setMemories] = useState<Memory[]>(() => peekMemories() ?? []);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(() => peekMemories() !== null);

  const load = useCallback(async () => {
    const cached = peekMemories() !== null;
    if (!cached) setLoading(true);
    try {
      setMemories(await listMemories());
    } catch {
      if (!cached) notify(t.saved.offline, "error");
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
