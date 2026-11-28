import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { randomUUID } from "expo-crypto";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { t } from "@/i18n";
import { track } from "@/lib/analytics";
import { createLinkTask } from "@/lib/api";
import { dueAt, dueChoices, type DueChoice } from "@/tasks/logic";
import { sendOnWhatsApp } from "@/tasks/LinkTaskCard";
import { Button, Chip, DateTimePicker, formatPick, notify, palette, Screen, space, Text, TextField } from "@/ui";

/**
 * A task for someone who is not on Zaki: a name, what, by when. Zaki makes a link and the user
 * sends it from their own WhatsApp; the other person says yes and taps done on a web page.
 */
export default function LinkTaskScreen() {
  const { circle } = useLocalSearchParams<{ circle?: string }>();
  const words = t.lay.circlejobs;
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<DueChoice | "custom">("none");
  const [customDue, setCustomDue] = useState<Date | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  // One id per screen, so a second tap after a lost answer can't make a second task.
  const [id] = useState(() => randomUUID());
  const [choices] = useState(() => dueChoices(new Date()));
  const ready = name.trim().length > 0 && title.trim().length > 0;

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const { share_text } = await createLinkTask({
        id,
        circle_id: circle ?? null,
        other_name: name.trim(),
        title: title.trim(),
        due_at: due === "custom" ? customDue?.toISOString() ?? null : dueAt(due, new Date()),
      });
      track("link_task_sent");
      if (share_text) await sendOnWhatsApp(share_text);
      router.back();
    } catch {
      notify(t.tasks.failed, "error");
      setBusy(false);
    }
  };

  return (
    <Screen keyboard contentStyle={styles.content}>
      <Stack.Screen options={{ title: words.linkTitle }} />
      <TextField label={words.linkName} value={name} onChangeText={setName} placeholder={words.linkNameIdea} maxLength={40} autoFocus />
      <TextField label={t.tasks.what} value={title} onChangeText={setTitle} placeholder={t.tasks.whatIdea} maxLength={120} />
      <Text variant="smallStrong" color={palette.inkSoft}>
        {t.tasks.when}
      </Text>
      <View style={styles.row}>
        {choices.map((c) => (
          <Chip key={c} label={t.tasks.due[c]} selected={due === c} onPress={() => (setDue(c), setPicking(false))} />
        ))}
        <Chip icon="calendar-outline" label={due === "custom" && customDue ? formatPick(customDue) : t.picker.pickDate} selected={due === "custom"} onPress={() => setPicking(true)} />
      </View>
      {picking ? (
        <DateTimePicker
          initial={customDue}
          onCancel={() => setPicking(false)}
          onDone={(d) => {
            setCustomDue(d);
            setDue("custom");
            setPicking(false);
          }}
        />
      ) : null}
      <Button label={words.linkSend} icon="logo-whatsapp" size="lg" block busy={busy} disabled={!ready} onPress={() => void submit()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.md },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
