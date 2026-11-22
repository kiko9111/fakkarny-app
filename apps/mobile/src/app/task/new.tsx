import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import type { CircleMember } from "@fakkarni/shared";
import { t } from "@/i18n";
import { createTask, getCircle } from "@/lib/api";
import { colors } from "@/lib/theme";
import { dueAt, dueChoices, type DueChoice } from "@/tasks/logic";

/**
 * Ask someone in the circle to do something. They get the request from Zaki and decide;
 * nothing is added to their list, and the circle sees nothing, until they say yes.
 */
export default function NewTaskScreen() {
  const { circle } = useLocalSearchParams<{ circle: string }>();
  const [members, setMembers] = useState<CircleMember[] | null>(null);
  const [who, setWho] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<DueChoice>("none");
  const [busy, setBusy] = useState(false);
  const [choices] = useState(() => dueChoices(new Date()));

  useEffect(() => {
    getCircle(circle)
      .then((c) => {
        const others = c.members.filter((m) => !m.is_me);
        setMembers(others);
        if (others.length === 1) setWho(others[0]!.user_id);
      })
      .catch(() => setMembers([]));
  }, [circle]);

  const ready = Boolean(who) && title.trim().length > 0;
  const submit = async () => {
    if (!ready || busy || !who) return;
    setBusy(true);
    try {
      await createTask(circle, { assignee_id: who, title: title.trim(), due_at: dueAt(due, new Date()) });
      router.back();
    } catch {
      Alert.alert(t.tasks.failed);
      setBusy(false);
    }
  };

  const chip = (key: string, label: string, on: boolean, onPress: () => void) => (
    <Pressable key={key} style={[styles.chip, on && styles.chipOn]} onPress={onPress} accessibilityRole="button">
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: t.tasks.newTitle }} />
      {members === null ? <ActivityIndicator color={colors.accent} /> : null}
      {members?.length === 0 ? <Text style={styles.hint}>{t.tasks.noMembers}</Text> : null}
      {members?.length ? (
        <>
          <Text style={styles.label}>{t.tasks.who}</Text>
          <View style={styles.row}>{members.map((m) => chip(m.user_id, m.name ?? t.circles.noName, who === m.user_id, () => setWho(m.user_id)))}</View>
          <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder={t.tasks.what} maxLength={120} />
          <Text style={styles.label}>{t.tasks.when}</Text>
          <View style={styles.row}>{choices.map((c) => chip(c, t.tasks.due[c], due === c, () => setDue(c)))}</View>
          <Pressable style={[styles.primary, (!ready || busy) && styles.dim]} disabled={!ready || busy} onPress={() => void submit()} accessibilityRole="button">
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{t.tasks.send}</Text>}
          </Pressable>
          <Text style={styles.hint}>{t.tasks.intro}</Text>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 24, gap: 12 },
  label: { color: colors.muted, fontSize: 13, textAlign: "left" },
  input: { backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 17, color: colors.text, writingDirection: "auto" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.accent, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8 },
  chipOn: { backgroundColor: colors.accent },
  chipText: { color: colors.accent, fontWeight: "600" },
  chipTextOn: { color: "#fff" },
  primary: { backgroundColor: colors.accent, borderRadius: 16, paddingVertical: 14, alignItems: "center" },
  primaryText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  dim: { opacity: 0.5 },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: "center" },
});
