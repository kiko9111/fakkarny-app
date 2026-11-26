import { useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { MAX_HOMEWORK_PHOTOS, type CircleTask, type PhotoUpload, type TaskStatus } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { t, dateLocale } from "@/i18n";
import { router } from "expo-router";
import { HttpError } from "@/sync/queue";
import { cancelTask, finishTask, nudgeTask, remindTask, respondTask, reviewHomework, submitHomework } from "@/lib/api";
import { pullItems } from "@/sync/items";
import { track } from "@/lib/analytics";
import { photosAvailable, pickPhotos } from "@/lib/photos";
import { HomeworkPhotos } from "./HomeworkPhotos";
import { Badge, Button, Card, Chip, confirm, DateTimePicker, Icon, notify, palette, space, Text, TextField } from "@/ui";
import { firstLink, guessTask, remindAt, remindChoices, taskActions, type RemindChoice, type TaskAction } from "./logic";
import { useGuess } from "@/lib/optimistic";

const when = (iso: string) => new Date(iso).toLocaleString(dateLocale, { weekday: "short", hour: "numeric", minute: "2-digit" });
const TONE: Record<TaskStatus, "neutral" | "ok" | "warn" | "danger" | "primary"> = { pending: "warn", accepted: "primary", declined: "neutral", done: "ok", cancelled: "neutral" };
const ACTION_ICON: Partial<Record<TaskAction, "checkmark" | "close" | "notifications-outline" | "checkmark-done">> = { accept: "checkmark", decline: "close", done: "checkmark-done", nudge: "notifications-outline" };

/**
 * One assigned task with the actions this person can take. `onChanged` reloads the list.
 * Yes, No, Done and Cancel show at once (the card's own guess, lib/optimistic.ts) while the
 * server confirms; a nudge, a hand-in and a review wait for the server, because they are Zaki
 * writing to someone else.
 */
export function TaskCard({ task: fromList, showCircle, onChanged }: { task: CircleTask; showCircle?: boolean; onChanged: () => void }) {
  const { shown: task, busy, waiting, run: send } = useGuess(fromList);
  const [picking, setPicking] = useState(false);
  const [calendar, setCalendar] = useState(false);
  // Homework: the child's answer or link, or the parent's redo note, while typing.
  const [draft, setDraft] = useState<"hand_in" | "redo" | null>(null);
  const [text, setText] = useState("");
  // Homework pages picked for hand-in (receipts and homework are the only photos in the app).
  const [photos, setPhotos] = useState<PhotoUpload[]>([]);
  const addPhotos = async (source: "camera" | "library") => {
    const room = MAX_HOMEWORK_PHOTOS - photos.length;
    if (room <= 0) return;
    try {
      const picked = await pickPhotos(source, room);
      if (!picked) return;
      if ("denied" in picked) return notify(t.receipt.denied);
      if ("tooBig" in picked) return notify(t.receipt.tooBig);
      setPhotos((p) => [...p, ...picked.photos].slice(0, MAX_HOMEWORK_PHOTOS));
    } catch {
      notify(t.tasks.failed, "error");
    }
  };

  const work = async (fn: () => Promise<CircleTask>, after?: string, guess?: CircleTask | null) => {
    try {
      await send(fn, { guess, adopt: (answer) => answer });
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
    }
  };

  const run = (action: TaskAction) => {
    if (busy) return;
    const guess = guessTask(task, action, new Date());
    if (action === "cancel") return confirm(t.tasks.cancelConfirm, t.tasks.yes, () => void work(() => cancelTask(task.id), undefined, guess), t.tasks.no);
    if (action === "nudge") return void work(() => nudgeTask(task.id), t.tasks.nudged);
    if (action === "done") return void work(() => finishTask(task.id), undefined, guess);
    return void work(() => respondTask(task.id, action), undefined, guess);
  };

  const open = task.status === "pending" || task.status === "accepted";
  // Mirrors the server: the assigner while pending, the assignee while it is open.
  const canRemind = (task.role === "assigner" && task.status === "pending") || (task.role === "assignee" && open);
  const pickRemind = (c: RemindChoice) => {
    setPicking(false);
    const at = remindAt(c, new Date(), task.due_at);
    void work(() => remindTask(task.id, at), t.tasks.remindChanged, { ...task, remind_at: at });
  };
  const link = firstLink(task.note);

  const assigner = task.assigner_name ?? t.circles.noName;
  const assignee = task.assignee_name ?? t.circles.noName;
  const who = task.role === "assignee" ? fill(t.tasks.fromLine, { name: assigner }) : task.role === "assigner" ? fill(t.tasks.toLine, { name: assignee }) : fill(t.tasks.watchLine, { assignee, assigner });
  // Homework is handed in (answer or link), not just ticked: the parent then reviews it.
  const homeworkOpen = task.homework && task.role === "assignee" && open;
  const actions = taskActions(task).filter((a) => !(homeworkOpen && a === "done"));
  const toReview = task.homework && task.role === "assigner" && task.status === "done" && task.submission !== null && task.review === null;
  const sendDraft = () => {
    const value = text.trim();
    if (draft === "hand_in" && (value || photos.length)) {
      track("homework_handed_in", { link: firstLink(value) !== null });
      if (photos.length) track("homework_photos", { count: photos.length });
      const pages = photos;
      void work(() => submitHomework(task.id, value, pages), t.tasks.handedIn).then(() => {
        setDraft(null);
        setPhotos([]);
      });
    }
    if (draft === "redo") void work(() => reviewHomework(task.id, "redo", value || undefined), t.tasks.redoSent).then(() => setDraft(null));
    setText("");
  };
  return (
    <Card style={waiting ? styles.dim : undefined}>
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
      {task.homework && (task.submission || task.photo_ids.length) ? (
        <View style={styles.submission}>
          <Text variant="caption" color={palette.inkSoft}>
            {t.tasks.handedInLabel}
          </Text>
          {task.submission ? (
            <Text variant="small" color={palette.ink}>
              {task.submission}
            </Text>
          ) : null}
          {task.photo_ids.length ? <HomeworkPhotos ids={task.photo_ids} /> : null}
          {task.submission && firstLink(task.submission) ? <Button label={t.tasks.openLink} size="sm" kind="text" icon="open-outline" onPress={() => void Linking.openURL(firstLink(task.submission!)!)} /> : null}
          {task.review ? (
            <Text variant="small" color={task.review === "approved" ? palette.ok : palette.warn}>
              {task.review === "approved" ? t.tasks.approved : fill(t.tasks.redoLine, { note: task.review_note ?? "" })}
            </Text>
          ) : null}
        </View>
      ) : null}
      {link ? <Button label={t.tasks.openLink} size="sm" kind="outline" icon="open-outline" onPress={() => void Linking.openURL(link)} /> : null}
      {picking ? (
        <View style={styles.actions}>
          {remindChoices(new Date(), task.due_at).map((c) => (
            <Chip key={c} icon="alarm-outline" label={t.tasks.remind[c]} onPress={() => pickRemind(c)} />
          ))}
          <Chip icon="calendar-outline" label={t.picker.pickRemind} onPress={() => (setPicking(false), setCalendar(true))} />
        </View>
      ) : null}
      {calendar ? (
        <DateTimePicker
          initial={task.remind_at ? new Date(task.remind_at) : null}
          onCancel={() => setCalendar(false)}
          onDone={(d) => {
            setCalendar(false);
            void work(() => remindTask(task.id, d.toISOString()), t.tasks.remindChanged, { ...task, remind_at: d.toISOString() });
          }}
        />
      ) : null}
      {draft ? (
        <View style={styles.draft}>
          <TextField value={text} onChangeText={setText} maxLength={draft === "hand_in" ? 1000 : 300} multiline placeholder={draft === "hand_in" ? t.tasks.handInPlaceholder : t.tasks.redoPlaceholder} autoFocus />
          {draft === "hand_in" && photosAvailable ? (
            <>
              <View style={styles.actions}>
                <Button label={t.tasks.photoCamera} size="sm" kind="tonal" icon="camera-outline" disabled={busy || photos.length >= MAX_HOMEWORK_PHOTOS} onPress={() => void addPhotos("camera")} />
                <Button label={t.tasks.photoLibrary} size="sm" kind="text" icon="images-outline" disabled={busy || photos.length >= MAX_HOMEWORK_PHOTOS} onPress={() => void addPhotos("library")} />
              </View>
              {photos.length ? (
                <Text variant="small" color={palette.ink}>
                  {fill(t.tasks.photosPicked, { n: photos.length })}
                </Text>
              ) : null}
              <Text variant="caption" color={palette.inkSoft}>
                {t.tasks.photosNote}
              </Text>
            </>
          ) : null}
          <View style={styles.actions}>
            <Button label={draft === "hand_in" ? t.tasks.handIn : t.tasks.redo} size="sm" icon="send" disabled={busy || (draft === "hand_in" && !text.trim() && !photos.length)} onPress={sendDraft} />
            <Button
              label={t.ui.cancel}
              size="sm"
              kind="text"
              onPress={() => {
                setDraft(null);
                setPhotos([]);
              }}
            />
          </View>
        </View>
      ) : null}
      {!draft && (homeworkOpen || toReview) ? (
        <View style={styles.actions}>
          {homeworkOpen ? <Button label={t.tasks.handIn} size="sm" icon="cloud-upload-outline" disabled={busy} onPress={() => setDraft("hand_in")} /> : null}
          {toReview ? <Button label={t.tasks.wellDone} size="sm" icon="star" disabled={busy} onPress={() => void work(() => reviewHomework(task.id, "approved"), t.tasks.approvedSent)} /> : null}
          {toReview ? <Button label={t.tasks.redo} size="sm" kind="outline" icon="refresh" disabled={busy} onPress={() => setDraft("redo")} /> : null}
        </View>
      ) : null}
      {actions.length ? (
        <View style={styles.actions}>
          {actions.map((a, n) => (
            <Button key={a} label={t.tasks.actions[a]} size="sm" icon={ACTION_ICON[a]} kind={a === "cancel" ? "danger" : n === 0 ? "filled" : "outline"} disabled={busy} onPress={() => run(a)} />
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
  submission: { gap: 2, paddingStart: space.sm, borderStartWidth: 2, borderStartColor: palette.primarySoft },
  draft: { gap: space.xs },
});
