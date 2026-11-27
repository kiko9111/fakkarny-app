import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { fill } from "@/circles/logic";
import { getMessage, setSaved } from "@/db/messages";
import type { SavedSummary } from "@/db/saved";
import { t, dateLocale } from "@/i18n";
import { deleteMemory, patchItem } from "@/lib/api";
import { failText } from "@/lib/errors";
import { saveItem } from "@/sync/save-item";
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
    } catch (err) {
      notify(failText(err, t.saved.offline), "error");
    }
  };

  if (!saved) return <Stack.Screen options={{ title: t.saved.title }} />;

  return (
    <Screen keyboard contentStyle={styles.content}>
      <Stack.Screen options={{ title: t.saved.title }} />
      {saved.items.map((item) => (
        <Card key={item.id} style={styles.card}>
          <View style={styles.head}>
            <IconTile name={item.alarm ? "alarm" : "alarm-outline"} size={40} />
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
                  {item.alarm && (item.remind_at ?? item.due_at) ? (
                    <Text variant="small" color={palette.primaryInk}>
                      {fill(t.saved.alarmSet, { time: new Date((item.remind_at ?? item.due_at)!).toLocaleTimeString(dateLocale, { hour: "numeric", minute: "2-digit" }) })}
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
                      await saveItem(updated);
                      await persist({ ...saved, items: saved.items.map((i) => (i.id === item.id ? { ...i, title: updated.title } : i)) });
                      setEditing(null);
                    })
                  }
                />
              </>
            ) : (
              <>
                <Button kind="text" size="sm" icon="create-outline" label={t.saved.rename} onPress={() => (setEditing(item.id), setDraft(item.title))} />
                {item.type === "reminder" || item.type === "task" ? (
                  <Button
                    kind="text"
                    size="sm"
                    icon={item.alarm ? "notifications-off-outline" : "alarm-outline"}
                    label={item.alarm ? t.saved.alarmOff : t.saved.alarmOn}
                    onPress={() => {
                      // An alarm needs a clock time; "after Fajr" with no time can't ring.
                      if (!item.alarm && !(item.remind_at ?? item.due_at)) return notify(t.saved.alarmNoTime, "error");
                      void guard(async () => {
                        const updated = await patchItem(item.id, { alarm: !item.alarm });
                        await saveItem(updated);
                        await persist({ ...saved, items: saved.items.map((i) => (i.id === item.id ? { ...i, alarm: updated.alarm, remind_at: updated.remind_at, due_at: updated.due_at } : i)) });
                      });
                    }}
                  />
                ) : null}
                <Button
                  kind="text"
                  size="sm"
                  icon="trash-outline"
                  label={t.saved.remove}
                  onPress={() =>
                    guard(async () => {
                      const updated = await patchItem(item.id, { status: "cancelled" });
                      // Also clears its notifications (a removed reminder used to keep ringing).
                      await saveItem(updated);
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
