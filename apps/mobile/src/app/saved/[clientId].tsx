import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { getMessage, setSaved, upsertItem } from "@/db/messages";
import type { SavedSummary } from "@/db/saved";
import { t, dateLocale } from "@/i18n";
import { deleteMemory, patchItem } from "@/lib/api";
import { messagesChanged } from "@/sync";
import { Button, Card, IconTile, notify, palette, plain, Screen, space, Text, TextField } from "@/ui";

/** F2: tapping the "Saved" chip lets the user fix what the friend remembered. */
export default function SavedScreen() {
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const [saved, setLocalSaved] = useState<SavedSummary | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    void getMessage(clientId).then((m) => setLocalSaved(m?.saved ?? null));
  }, [clientId]);

  const persist = async (next: SavedSummary) => {
    setLocalSaved(next);
    await setSaved(clientId, next);
    messagesChanged.emit();
  };

  const guard = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch {
      notify(t.saved.offline, "error");
    }
  };

  if (!saved) return <Stack.Screen options={{ title: t.saved.title }} />;

  return (
    <Screen keyboard contentStyle={styles.content}>
      <Stack.Screen options={{ title: t.saved.title }} />
      <Text variant="body" color={palette.inkSoft}>
        {plain(t.saved.hint)}
      </Text>

      {saved.items.map((item) => (
        <Card key={item.id} style={styles.card}>
          <View style={styles.head}>
            <IconTile name="alarm-outline" size={40} />
            <View style={styles.flex}>
              {editing === item.id ? (
                <TextField value={draft} onChangeText={setDraft} autoFocus />
              ) : (
                <>
                  <Text variant="bodyStrong">{item.title}</Text>
                  {item.due_at ? (
                    <Text variant="small" color={palette.inkSoft}>
                      {new Date(item.due_at).toLocaleString(dateLocale)}
                    </Text>
                  ) : null}
                </>
              )}
            </View>
          </View>
          <View style={styles.actions}>
            {editing === item.id ? (
              <>
                <Button kind="text" size="sm" label={t.ui.cancel} onPress={() => setEditing(null)} />
                <Button
                  size="sm"
                  label={t.saved.save}
                  disabled={!draft.trim()}
                  onPress={() =>
                    guard(async () => {
                      const updated = await patchItem(item.id, { title: draft.trim() });
                      await upsertItem(updated);
                      await persist({ ...saved, items: saved.items.map((i) => (i.id === item.id ? { ...i, title: updated.title } : i)) });
                      setEditing(null);
                    })
                  }
                />
              </>
            ) : (
              <>
                <Button kind="text" size="sm" icon="create-outline" label={t.saved.rename} onPress={() => (setEditing(item.id), setDraft(item.title))} />
                <Button
                  kind="text"
                  size="sm"
                  icon="trash-outline"
                  label={t.saved.remove}
                  onPress={() =>
                    guard(async () => {
                      const updated = await patchItem(item.id, { status: "cancelled" });
                      await upsertItem(updated);
                      await persist({ ...saved, items: saved.items.filter((i) => i.id !== item.id) });
                    })
                  }
                />
              </>
            )}
          </View>
        </Card>
      ))}

      {saved.memories.map((m) => (
        <Card key={m.id} style={styles.card}>
          <View style={styles.head}>
            <IconTile name="bookmark-outline" size={40} color={palette.calm} bg={palette.calmSoft} />
            <View style={styles.flex}>
              <Text variant="caption" color={palette.inkSoft}>
                {plain(t.saved.memory)}
              </Text>
              <Text variant="bodyStrong">
                {m.subject}: {m.content}
              </Text>
            </View>
          </View>
          <View style={styles.actions}>
            <Button
              kind="text"
              size="sm"
              icon="trash-outline"
              label={t.saved.remove}
              onPress={() =>
                guard(async () => {
                  await deleteMemory(m.id);
                  await persist({ ...saved, memories: saved.memories.filter((x) => x.id !== m.id) });
                })
              }
            />
          </View>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  card: { gap: space.sm },
  head: { flexDirection: "row", gap: space.md, alignItems: "center" },
  flex: { flex: 1, gap: 2 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: space.xs },
});
