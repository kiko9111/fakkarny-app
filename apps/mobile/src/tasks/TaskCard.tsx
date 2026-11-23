import { useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import type { CircleTask, TaskStatus } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { t, dateLocale } from "@/i18n";
import { router } from "expo-router";
import { HttpError } from "@/sync/queue";
import { cancelTask, finishTask, nudgeTask, remindTask, respondTask } from "@/lib/api";
import { pullItems } from "@/sync/items";
import { Badge, Button, Card, Chip, confirm, Icon, notify, palette, space, Text } from "@/ui";
import { firstLink, remindAt, remindChoices, taskActions, type RemindChoice, type TaskAction } from "./logic";

const when = (iso: string) => new Date(iso).toLocaleString(dateLocale, { weekday: "short", hour: "numeric", minute: "2-digit" });
const TONE: Record<TaskStatus, "neutral" | "ok" | "warn" | "danger" | "primary"> = { pending: "warn", accepted: "primary", declined: "neutral", done: "ok", cancelled: "neutral" };
const ACTION_ICON: Partial<Record<TaskAction, "checkmark" | "close" | "notifications-outline" | "checkmark-done">> = { accept: "checkmark", decline: "close", done: "checkmark-done", nudge: "notifications-outline" };

/** One assigned task with the actions this person can take. `onChanged` reloads the list. */
export function TaskCard({ task, showCircle, onChanged }: { task: CircleTask; showCircle?: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);

  const work = async (fn: () => Promise<unknown>, after?: string) => {
    setBusy(true);
    try {
      await fn();
      // Accepting makes the task one of the user's reminders; cancelling/finishing closes it.
      void pullItems();
      if (after) notify(after);
      onChanged();
    } catch (err) {
      // More nudges after a circle's trial are a Pro extra.
      if (err instanceof HttpError && err.status === 402) {
        notify(t.circles.extrasNeeded, "info");
        router.push("/paywall");
      } else notify(t.tasks.failed, "error");
    } finally {
      setBusy(false);
    }
  };

  const run = (action: TaskAction) => {
    if (busy) return;
    if (action === "cancel") return confirm(t.tasks.cancelConfirm, t.tasks.yes, () => void work(() => cancelTask(task.id)), t.tasks.no);
    if (action === "nudge") return void work(() => nudgeTask(task.id), t.tasks.nudged);
    if (action === "done") return void work(() => finishTask(task.id));
    return void work(() => respondTask(task.id, action));
  };

  const open = task.status === "pending" || task.status === "accepted";
  // Mirrors the server: the assigner while pending, the assignee while it is open.
  const canRemind = (task.role === "assigner" && task.status === "pending") || (task.role === "assignee" && open);
  const pickRemind = (c: RemindChoice) => {
    setPicking(false);
    void work(() => remindTask(task.id, remindAt(c, new Date(), task.due_at)), t.tasks.remindChanged);
  };
  const link = firstLink(task.note);

  const assigner = task.assigner_name ?? t.circles.noName;
  const assignee = task.assignee_name ?? t.circles.noName;
  const who = task.role === "assignee" ? fill(t.tasks.fromLine, { name: assigner }) : task.role === "assigner" ? fill(t.tasks.toLine, { name: assignee }) : fill(t.tasks.watchLine, { assignee, assigner });
  const actions = taskActions(task);
  return (
    <Card style={busy ? styles.dim : undefined}>
      <View style={styles.head}>
        <Text variant="bodyStrong" color={task.status === "done" ? palette.inkFaint : palette.ink} style={[styles.title, task.status === "done" && styles.struck]}>
          {task.title}
        </Text>
        {task.homework ? <Badge label={t.tasks.homework} tone="primary" /> : null}
        <Badge label={t.tasks.status[task.status]} tone={TONE[task.status]} />
      </View>
      <View style={styles.meta}>
        <Icon name="person-outline" size={14} color={palette.inkSoft} />
        <Text variant="small" color={palette.inkSoft} style={styles.flex}>
          {showCircle ? `${who} · ${task.circle_name}` : who}
        </Text>
      </View>
      {task.due_at && task.status !== "done" ? (
        <View style={styles.meta}>
          <Icon name="time-outline" size={14} color={palette.inkSoft} />
          <Text variant="small" color={palette.inkSoft}>
            {when(task.due_at)}
          </Text>
        </View>
      ) : null}
      {task.remind_at && open ? (
        <View style={styles.meta}>
          <Icon name="alarm-outline" size={14} color={palette.inkSoft} />
          <Text variant="small" color={palette.inkSoft}>
            {fill(t.tasks.remindLine, { when: when(task.remind_at) })}
          </Text>
        </View>
      ) : null}
      {task.homework && task.note ? (
        <View style={styles.meta}>
          <Icon name="school-outline" size={14} color={palette.inkSoft} />
          <Text variant="small" color={palette.ink} style={styles.flex}>
            {task.note}
          </Text>
        </View>
      ) : null}
      {link ? <Button label={t.tasks.openLink} size="sm" kind="outline" icon="open-outline" onPress={() => void Linking.openURL(link)} /> : null}
      {picking ? (
        <View style={styles.actions}>
          {remindChoices(new Date(), task.due_at).map((c) => (
            <Chip key={c} icon="alarm-outline" label={t.tasks.remind[c]} onPress={() => pickRemind(c)} />
          ))}
        </View>
      ) : null}
      {actions.length ? (
        <View style={styles.actions}>
          {actions.map((a, n) => (
            <Button key={a} label={t.tasks.actions[a]} size="sm" icon={ACTION_ICON[a]} kind={n === 0 ? "filled" : a === "cancel" ? "danger" : "outline"} disabled={busy} onPress={() => run(a)} />
          ))}
          {canRemind && !picking ? <Button label={t.tasks.changeRemind} size="sm" kind="text" icon="alarm-outline" disabled={busy} onPress={() => setPicking(true)} /> : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  dim: { opacity: 0.6 },
  flex: { flex: 1 },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  title: { flex: 1 },
  struck: { textDecorationLine: "line-through" },
  meta: { flexDirection: "row", alignItems: "center", gap: 6 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.xs },
});
