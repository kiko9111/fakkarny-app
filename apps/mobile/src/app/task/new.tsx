import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import type { CircleMember, FamilyType } from "@fakkarni/shared";
import { t } from "@/i18n";
import { createTask, getCircle } from "@/lib/api";
import { dueAt, dueChoices, remindAt, remindChoices, type DueChoice, type RemindChoice } from "@/tasks/logic";
import { Button, Chip, DateTimePicker, EmptyState, formatPick, Note, notify, palette, plain, Screen, space, Text, TextField } from "@/ui";

/**
 * Ask someone in the circle to do something. They get the request from Zaki and decide;
 * nothing is added to their list, and the circle sees nothing, until they say yes.
 */
export default function NewTaskScreen() {
  const { circle } = useLocalSearchParams<{ circle: string }>();
  const [members, setMembers] = useState<CircleMember[] | null>(null);
  const [who, setWho] = useState<string | null>(null);
  const [familyType, setFamilyType] = useState<FamilyType | null>(null);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<DueChoice | "custom">("none");
  const [remind, setRemind] = useState<RemindChoice | "custom">("due");
  // Any day and time from the calendar, besides the quick picks (owner ask, 2026-11-24).
  const [customDue, setCustomDue] = useState<Date | null>(null);
  const [customRemind, setCustomRemind] = useState<Date | null>(null);
  const [picking, setPicking] = useState<"due" | "remind" | null>(null);
  const [homework, setHomework] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [choices] = useState(() => dueChoices(new Date()));
  const dueFor = (now: Date) => (due === "custom" ? customDue?.toISOString() ?? null : dueAt(due, now));
  const dueIso = dueFor(new Date());
  const reminds = remindChoices(new Date(), dueIso);
  const remindFor = (now: Date, d: string | null) =>
    remind === "custom" ? customRemind?.toISOString() ?? null : remindAt(reminds.includes(remind) ? remind : "due", now, d);

  useEffect(() => {
    getCircle(circle)
      .then((c) => {
        const others = c.members.filter((m) => !m.is_me);
        setMembers(others);
        setFamilyType(c.kind === "family" ? c.family_type ?? "mixed" : null);
        if (others.length === 1) setWho(others[0]!.user_id);
      })
      .catch(() => setMembers([]));
  }, [circle]);

  const ready = Boolean(who) && title.trim().length > 0;
  const submit = async () => {
    if (!ready || busy || !who) return;
    setBusy(true);
    try {
      const now = new Date();
      const dueAtIso = dueFor(now);
      await createTask(circle, {
        assignee_id: who,
        title: title.trim(),
        due_at: dueAtIso,
        remind_at: remindFor(now, dueAtIso),
        homework,
        note: homework && note.trim() ? note.trim() : null,
      });
      router.back();
    } catch {
      notify(t.tasks.failed, "error");
      setBusy(false);
    }
  };

  const label = (text: string) => (
    <Text variant="smallStrong" color={palette.inkSoft}>
      {text}
    </Text>
  );

  return (
    <Screen keyboard contentStyle={styles.content}>
      <Stack.Screen options={{ title: t.tasks.newTitle }} />
      {members === null ? <ActivityIndicator color={palette.primary} /> : null}
      {members?.length === 0 ? <EmptyState title={plain(t.tasks.noMembers)} /> : null}
      {members?.length ? (
        <>
          {label(t.tasks.who)}
          <View style={styles.row}>
            {members.map((m) => (
              <Chip key={m.user_id} icon="person-outline" label={m.name ?? t.circles.noName} selected={who === m.user_id} onPress={() => setWho(m.user_id)} />
            ))}
          </View>
          <TextField label={t.tasks.what} value={title} onChangeText={setTitle} placeholder={homework ? t.tasks.homeworkIdea : t.tasks.what} maxLength={120} />
          <View style={styles.row}>
            <Chip icon="school-outline" label={t.tasks.homeworkToggle} selected={homework} onPress={() => setHomework((h) => !h)} />
          </View>
          {homework ? <TextField label={t.tasks.homeworkNote} value={note} onChangeText={setNote} placeholder="https://…" maxLength={500} multiline /> : null}
          {familyType && !title.trim() ? (
            <>
              {label(t.family.ideasTitle)}
              <View style={styles.row}>
                {t.family.ideas[familyType].split("|").map((idea) => (
                  <Chip key={idea} tone="family" label={plain(idea)} onPress={() => setTitle(plain(idea))} />
                ))}
              </View>
            </>
          ) : null}
          {label(t.tasks.when)}
          <View style={styles.row}>
            {choices.map((c) => (
              <Chip key={c} label={t.tasks.due[c]} selected={due === c} onPress={() => (setDue(c), setPicking(null))} />
            ))}
            <Chip icon="calendar-outline" label={due === "custom" && customDue ? formatPick(customDue) : t.picker.pickDate} selected={due === "custom"} onPress={() => setPicking("due")} />
          </View>
          {picking === "due" ? (
            <DateTimePicker
              initial={customDue}
              onCancel={() => setPicking(null)}
              onDone={(d) => {
                setCustomDue(d);
                setDue("custom");
                setPicking(null);
              }}
            />
          ) : null}
          {label(t.tasks.remindWhen)}
          <View style={styles.row}>
            {reminds.map((c) => (
              <Chip key={c} icon={c === "due" ? undefined : "alarm-outline"} label={t.tasks.remind[c]} selected={remind === c} onPress={() => (setRemind(c), setPicking(null))} />
            ))}
            <Chip icon="calendar-outline" label={remind === "custom" && customRemind ? formatPick(customRemind) : t.picker.pickRemind} selected={remind === "custom"} onPress={() => setPicking("remind")} />
          </View>
          {picking === "remind" ? (
            <DateTimePicker
              initial={customRemind ?? (dueIso ? new Date(new Date(dueIso).getTime() - 3_600_000) : null)}
              onCancel={() => setPicking(null)}
              onDone={(d) => {
                setCustomRemind(d);
                setRemind("custom");
                setPicking(null);
              }}
            />
          ) : null}
          <Button label={t.tasks.send} icon="send" size="lg" block busy={busy} disabled={!ready} onPress={() => void submit()} />
          <Note icon="hand-left-outline">{plain(t.tasks.intro)}</Note>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.md },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
