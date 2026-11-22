import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import type { CircleTask } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { t } from "@/i18n";
import { cancelTask, finishTask, nudgeTask, respondTask } from "@/lib/api";
import { colors } from "@/lib/theme";
import { pullItems } from "@/sync/items";
import { taskActions, type TaskAction } from "./logic";

const when = (iso: string) => new Date(iso).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });

/** One assigned task with the actions this person can take. `onChanged` reloads the list. */
export function TaskCard({ task, showCircle, onChanged }: { task: CircleTask; showCircle?: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);

  const work = async (fn: () => Promise<unknown>, after?: string) => {
    setBusy(true);
    try {
      await fn();
      // Accepting makes the task one of the user's reminders; cancelling/finishing closes it.
      void pullItems();
      if (after) Alert.alert(after);
      onChanged();
    } catch {
      Alert.alert(t.tasks.failed);
    } finally {
      setBusy(false);
    }
  };

  const run = (action: TaskAction) => {
    if (busy) return;
    if (action === "cancel") {
      Alert.alert(t.tasks.cancelConfirm, undefined, [
        { text: t.tasks.no, style: "cancel" },
        { text: t.tasks.yes, style: "destructive", onPress: () => void work(() => cancelTask(task.id)) },
      ]);
      return;
    }
    if (action === "nudge") return void work(() => nudgeTask(task.id), t.tasks.nudged);
    if (action === "done") return void work(() => finishTask(task.id));
    return void work(() => respondTask(task.id, action));
  };

  const assigner = task.assigner_name ?? t.circles.noName;
  const assignee = task.assignee_name ?? t.circles.noName;
  const who = task.role === "assignee" ? fill(t.tasks.fromLine, { name: assigner }) : task.role === "assigner" ? fill(t.tasks.toLine, { name: assignee }) : fill(t.tasks.watchLine, { assignee, assigner });
  const actions = taskActions(task);
  return (
    <View style={[styles.card, busy && styles.dim]}>
      <View style={styles.head}>
        <Text style={[styles.title, task.status === "done" && styles.struck]}>{task.title}</Text>
        <Text style={[styles.status, (task.status === "accepted" || task.status === "done") && styles.ok]}>{t.tasks.status[task.status]}</Text>
      </View>
      <Text style={styles.line}>{showCircle ? `${who} · ${task.circle_name}` : who}</Text>
      {task.due_at && task.status !== "done" ? <Text style={styles.note}>{when(task.due_at)}</Text> : null}
      {actions.length ? (
        <View style={styles.actions}>
          {actions.map((a, n) => (
            <Pressable key={a} disabled={busy} onPress={() => run(a)} style={({ pressed }) => [styles.action, n === 0 && styles.primary, pressed && styles.dim]} accessibilityRole="button">
              <Text style={[styles.actionText, n === 0 && styles.primaryText]}>{t.tasks.actions[a]}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, gap: 4 },
  dim: { opacity: 0.6 },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { flex: 1, fontSize: 16, fontWeight: "600", color: colors.text, textAlign: "left" },
  struck: { textDecorationLine: "line-through", color: colors.muted },
  status: { fontSize: 12, color: colors.muted },
  ok: { color: colors.ok },
  line: { fontSize: 14, color: colors.text, textAlign: "left" },
  note: { fontSize: 13, color: colors.muted, textAlign: "left" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  action: { borderWidth: 1, borderColor: colors.accent, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  actionText: { color: colors.accent, fontWeight: "600" },
  primary: { backgroundColor: colors.accent },
  primaryText: { color: "#fff" },
});
