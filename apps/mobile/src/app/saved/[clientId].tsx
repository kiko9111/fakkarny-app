import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { getMessage, setSaved, upsertItem } from "@/db/messages";
import type { SavedSummary } from "@/db/saved";
import { t } from "@/i18n";
import { deleteMemory, patchItem } from "@/lib/api";
import { colors } from "@/lib/theme";
import { messagesChanged } from "@/sync";

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
      Alert.alert(t.saved.offline);
    }
  };

  if (!saved) return <Stack.Screen options={{ title: t.saved.title }} />;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t.saved.title }} />
      <Text style={styles.hint}>{t.saved.hint}</Text>

      {saved.items.map((item) => (
        <View key={item.id} style={styles.card}>
          {editing === item.id ? (
            <View style={styles.row}>
              <TextInput style={styles.input} value={draft} onChangeText={setDraft} autoFocus textAlign="start" />
              <Pressable
                style={styles.button}
                onPress={() =>
                  guard(async () => {
                    const updated = await patchItem(item.id, { title: draft });
                    await upsertItem(updated);
                    await persist({ ...saved, items: saved.items.map((i) => (i.id === item.id ? { ...i, title: updated.title } : i)) });
                    setEditing(null);
                  })
                }
              >
                <Text style={styles.buttonText}>{t.saved.save}</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.title}>{item.title}</Text>
              {item.due_at ? <Text style={styles.meta}>{new Date(item.due_at).toLocaleString()}</Text> : null}
              <View style={styles.row}>
                <Pressable onPress={() => (setEditing(item.id), setDraft(item.title))}>
                  <Text style={styles.link}>{t.saved.rename}</Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    guard(async () => {
                      const updated = await patchItem(item.id, { status: "cancelled" });
                      await upsertItem(updated);
                      await persist({ ...saved, items: saved.items.filter((i) => i.id !== item.id) });
                    })
                  }
                >
                  <Text style={[styles.link, styles.danger]}>{t.saved.remove}</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      ))}

      {saved.memories.map((m) => (
        <View key={m.id} style={styles.card}>
          <Text style={styles.meta}>{t.saved.memory}</Text>
          <Text style={styles.title}>
            {m.subject}: {m.content}
          </Text>
          <Pressable
            onPress={() =>
              guard(async () => {
                await deleteMemory(m.id);
                await persist({ ...saved, memories: saved.memories.filter((x) => x.id !== m.id) });
              })
            }
          >
            <Text style={[styles.link, styles.danger]}>{t.saved.remove}</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12 },
  hint: { color: colors.muted },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, gap: 6 },
  title: { fontSize: 16, color: colors.text },
  meta: { fontSize: 13, color: colors.muted },
  row: { flexDirection: "row", gap: 16, alignItems: "center" },
  link: { color: colors.accent, fontWeight: "600" },
  danger: { color: colors.error },
  input: { flex: 1, borderWidth: 1, borderColor: "#E5DDD5", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, fontSize: 16 },
  button: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  buttonText: { color: "#fff", fontWeight: "600" },
});
