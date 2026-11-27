import { useState } from "react";
import { StyleSheet } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import type { CircleTask, HomeworkCheck, PhotoUpload } from "@fakkarni/shared";
import { t } from "@/i18n";
import { track } from "@/lib/analytics";
import { checkHomework, peekTasks } from "@/lib/api";
import { HttpError } from "@/sync/queue";
import { PagePhotos } from "@/homework/PagePhotos";
import { Button, Card, Note, palette, plain, Screen, space, Text, TextField } from "@/ui";

/**
 * The child asks Zaki to look at their answers before handing in (2026-11-26). Zaki praises what
 * is good and points to where to look again with hints, never the answers. One AI message, at
 * most 5 checks a day per homework; what is typed or photographed is not kept.
 */
export default function HomeworkCheckScreen() {
  const params = useLocalSearchParams<{ task: string }>();
  const [task] = useState<CircleTask | null>(() => peekTasks()?.find((x) => x.id === params.task) ?? null);
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<PhotoUpload[]>([]);
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<HomeworkCheck | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const ask = async () => {
    if (busy || !params.task) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await checkHomework(params.task, { text: text.trim(), photos });
      track("homework_check", { ok: Boolean(res.check), hints: res.check?.hints.length ?? 0 });
      if (res.helpline) return setMessage(res.helpline);
      if (res.error === "limit") return setMessage(t.homework.limit);
      if (!res.check) return setMessage(t.homework.unreadable);
      setCheck(res.check);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 0;
      setMessage(status === 429 ? t.homework.checkTooMany : status === 503 ? t.homework.unavailable : t.tasks.failed);
    } finally {
      setBusy(false);
    }
  };

  const ready = text.trim().length > 0 || photos.length > 0;
  return (
    <Screen keyboard contentStyle={styles.content}>
      <Stack.Screen options={{ title: t.homework.checkTitle }} />
      {task ? (
        <Text variant="smallStrong" color={palette.inkSoft}>
          {[task.subject, task.title].filter(Boolean).join(" · ")}
        </Text>
      ) : null}
      {check ? null : <Note icon="color-wand-outline">{plain(t.homework.checkIntro)}</Note>}
      <TextField value={text} onChangeText={setText} placeholder={t.homework.checkPlaceholder} maxLength={2000} multiline />
      <PagePhotos photos={photos} onChange={setPhotos} disabled={busy} />
      <Button label={busy ? t.homework.thinking : t.homework.checkAsk} icon="color-wand-outline" size="lg" block busy={busy} disabled={!ready} onPress={() => void ask()} />
      {message ? (
        <Card>
          <Text variant="body">{message}</Text>
        </Card>
      ) : null}
      {check ? (
        <Card>
          <Text variant="bodyStrong">{check.praise}</Text>
          {check.hints.length ? (
            <>
              <Text variant="smallStrong" color={palette.primaryInk}>
                {t.homework.checkHints}
              </Text>
              {check.hints.map((h, n) => (
                <Text key={n} variant="body">
                  {`• ${h}`}
                </Text>
              ))}
            </>
          ) : (
            <Text variant="body" color={palette.ok}>
              {t.homework.checkGood}
            </Text>
          )}
        </Card>
      ) : null}
      {check ? <Button label={t.tasks.handIn} kind="outline" icon="cloud-upload-outline" block onPress={() => router.back()} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.md },
});
