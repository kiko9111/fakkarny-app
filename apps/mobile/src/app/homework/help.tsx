import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import type { CircleTask, HomeworkHelp, PhotoUpload } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { t } from "@/i18n";
import { track } from "@/lib/analytics";
import { createTask, homeworkHelp, peekTasks } from "@/lib/api";
import { HttpError } from "@/sync/queue";
import { PagePhotos } from "@/homework/PagePhotos";
import { practiceNote, shortTitle } from "@/homework/logic";
import { Button, Card, notify, palette, Screen, space, Text, TextField } from "@/ui";

/**
 * Zaki helps the parent with homework (2026-11-26): explains the lesson simply, says how to
 * explain it to the child, and makes practice questions (answers kept for the parent). Opened
 * from a homework card (`?task=`), the questions can go to the same child as a new homework.
 * One AI message; what is typed or photographed is not kept.
 */
export default function HomeworkHelpScreen() {
  const params = useLocalSearchParams<{ task?: string }>();
  const [task] = useState<CircleTask | null>(() => (params.task ? peekTasks()?.find((x) => x.id === params.task) ?? null : null));
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<PhotoUpload[]>([]);
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState<HomeworkHelp | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [answers, setAnswers] = useState(false);
  const [sent, setSent] = useState(false);

  const ask = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await homeworkHelp({ ...(params.task ? { task_id: params.task } : {}), text: text.trim(), photos });
      track("homework_help", { ok: Boolean(res.help), photos: photos.length });
      if (res.helpline) return setMessage(res.helpline);
      if (res.error === "limit") return setMessage(t.homework.limit);
      if (!res.help) return setMessage(t.homework.unreadable);
      setHelp(res.help);
      setAnswers(false);
      setSent(false);
    } catch (err) {
      setMessage(err instanceof HttpError && err.status === 503 ? t.homework.unavailable : t.tasks.failed);
    } finally {
      setBusy(false);
    }
  };

  const sendPractice = async () => {
    if (!task?.assignee_id || !help?.practice.length || busy) return;
    setBusy(true);
    try {
      await createTask(task.circle_id, {
        assignee_id: task.assignee_id,
        title: shortTitle(fill(t.homework.helpPracticeTitle, { title: task.title })),
        homework: true,
        note: practiceNote(help.practice),
        subject: task.subject,
      });
      track("homework_practice_sent", {});
      setSent(true);
      notify(t.homework.helpPracticeSent);
    } catch {
      notify(t.tasks.failed, "error");
    } finally {
      setBusy(false);
    }
  };

  const ready = text.trim().length > 0 || photos.length > 0 || Boolean(params.task);
  const section = (title: string, body: string) => (
    <Card>
      <Text variant="smallStrong" color={palette.primaryInk}>
        {title}
      </Text>
      <Text variant="body">{body}</Text>
    </Card>
  );

  return (
    <Screen keyboard contentStyle={styles.content}>
      <Stack.Screen options={{ title: t.homework.helpTitle }} />
      {task ? (
        <Text variant="smallStrong" color={palette.inkSoft}>
          {[task.subject, task.title].filter(Boolean).join(" · ")}
        </Text>
      ) : null}
      {help ? null : (
        <>
          <TextField value={text} onChangeText={setText} placeholder={t.homework.helpPlaceholder} maxLength={2000} multiline />
          <PagePhotos photos={photos} onChange={setPhotos} disabled={busy} />
          <Button label={busy ? t.homework.thinking : t.homework.helpAsk} icon="color-wand-outline" size="lg" block busy={busy} disabled={!ready} onPress={() => void ask()} />
        </>
      )}
      {message ? (
        <Card>
          <Text variant="body">{message}</Text>
        </Card>
      ) : null}
      {help ? (
        <>
          {section(t.homework.helpExplain, help.explain)}
          {help.teach ? section(t.homework.helpTeach, help.teach) : null}
          {help.practice.length ? (
            <Card>
              <Text variant="smallStrong" color={palette.primaryInk}>
                {t.homework.helpPractice}
              </Text>
              {help.practice.map((q, n) => (
                <Text key={n} variant="body">
                  {`${n + 1}) ${q}`}
                </Text>
              ))}
              {help.answers.length ? (
                answers ? (
                  <View style={styles.answers}>
                    <Text variant="caption" color={palette.inkSoft}>
                      {t.homework.helpAnswers}
                    </Text>
                    {help.answers.map((a, n) => (
                      <Text key={n} variant="small" color={palette.inkSoft}>
                        {`${n + 1}) ${a}`}
                      </Text>
                    ))}
                  </View>
                ) : (
                  <Button label={t.homework.helpShowAnswers} size="sm" kind="text" icon="eye-outline" onPress={() => setAnswers(true)} />
                )
              ) : null}
            </Card>
          ) : null}
          {task?.assignee_id && help.practice.length && !sent ? <Button label={t.homework.helpSendPractice} icon="send" block busy={busy} onPress={() => void sendPractice()} /> : null}
          <Button
            label={t.homework.helpAgain}
            kind="outline"
            icon="refresh"
            block
            onPress={() => {
              setHelp(null);
              setText("");
              setPhotos([]);
            }}
          />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.md },
  answers: { gap: 2, marginTop: space.xs },
});
