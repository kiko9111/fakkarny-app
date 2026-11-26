import { useCallback, useState } from "react";
import { useLive } from "@/lib/live";
import { StyleSheet } from "react-native";
import type { Memory } from "@fakkarni/shared";
import { t } from "@/i18n";
import { deleteMemory, listMemories, peekMemories } from "@/lib/api";
import { confirm, EmptyState, IconButton, IconTile, ListRow, LoadingCards, notify, palette, plain, Screen, space } from "@/ui";

/** FR-4: the user can view and delete any memory. */
export default function MemoriesScreen() {
  // Starts from the saved copy, so the list shows at once and refreshes behind.
  const [memories, setMemories] = useState<Memory[]>(() => peekMemories() ?? []);
  const [loaded, setLoaded] = useState(() => peekMemories() !== null);

  const load = useCallback(async () => {
    const cached = peekMemories() !== null;
    try {
      setMemories(await listMemories());
    } catch {
      if (!cached) notify(t.saved.offline, "error");
    } finally {
      setLoaded(true);
    }
  }, []);

  useLive(load);

  const remove = (m: Memory) =>
    confirm(m.subject, t.memories.remove, () =>
      void deleteMemory(m.id)
        .then(() => setMemories((all) => all.filter((x) => x.id !== m.id)))
        .catch(() => notify(t.saved.offline, "error")),
    );

  return (
    <Screen onRefresh={load} contentStyle={styles.content}>
      {loaded && memories.length === 0 ? <EmptyState title={plain(t.memories.empty)} /> : null}
      {!loaded ? <LoadingCards /> : null}
      {/* Each memory is its own row on the page (a card around the rows drew two edges). */}
      {memories.map((m) => (
        <ListRow
          key={m.id}
          leading={<IconTile name="bookmark-outline" size={40} />}
          title={m.subject}
          meta={m.content}
          trailing={<IconButton name="trash-outline" label={t.memories.remove} color={palette.inkSoft} onPress={() => remove(m)} />}
        />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
});
