import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import type { Circle, MoneyKind } from "@fakkarni/shared";
import { parseAmount } from "@/daftar/logic";
import { t } from "@/i18n";
import { fill } from "@/circles/logic";
import { listCircles, peekCircles, peekMoney } from "@/lib/api";
import { makeSection } from "@/money/actions";
import { sameSection } from "@/money/logic";
import { Button, Chip, Note, notify, palette, plain, Screen, space, Text, TextField } from "@/ui";

/** A new expense or income section, with an optional monthly budget, personal or shared with a circle. */
export default function NewSectionScreen() {
  const params = useLocalSearchParams<{ circle?: string }>();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<MoneyKind>("expense");
  const [budgetText, setBudgetText] = useState("");
  const [circles, setCircles] = useState<Circle[]>(() => peekCircles() ?? []);
  const [circleId, setCircleId] = useState<string | null>(params.circle ?? null);
  const budget = parseAmount(budgetText);
  const ready = name.trim().length > 0 && (budgetText.trim() === "" || budget !== null);

  useEffect(() => {
    // The saved list shows at once; a failed refresh keeps it (it used to empty the chips).
    listCircles()
      .then(setCircles)
      .catch(() => {});
  }, []);

  // "Salary" when "salary" exists opens that one instead of making a twin.
  const twin = name.trim() ? sameSection(peekMoney()?.sections ?? [], name, kind, circleId) : null;

  // Local-first: the section exists on the phone at once and goes to the server behind.
  const submit = () => {
    if (!ready) return;
    const made = makeSection(
      { name: name.trim(), kind, budget: kind === "expense" ? budget : null, circle_id: circleId },
      { onFailed: () => notify(t.book.failed, "error"), onQueued: () => notify(t.book.waiting) },
    );
    if (made.existed) notify(fill(t.book.exists, { name: made.section.name }));
    router.replace({ pathname: "/money/[id]", params: { id: made.section.id } });
  };

  const label = (text: string) => (
    <Text variant="smallStrong" color={palette.inkSoft}>
      {text}
    </Text>
  );

  return (
    <Screen keyboard contentStyle={styles.content}>
      <Stack.Screen options={{ title: t.book.newTitle }} />
      <TextField label={t.book.name} value={name} onChangeText={setName} placeholder={t.book.name} maxLength={40} />
      {!name.trim() ? (
        <View style={styles.row}>
          {t.book.ideas.split("|").map((idea, n, all) => (
            <Chip key={idea} label={idea} onPress={() => (setName(idea), setKind(n === all.length - 1 ? "income" : "expense"))} />
          ))}
        </View>
      ) : null}
      {label(t.book.kind)}
      <View style={styles.row}>
        <Chip icon="arrow-up-circle-outline" label={t.book.kinds.expense} selected={kind === "expense"} onPress={() => setKind("expense")} />
        <Chip icon="arrow-down-circle-outline" label={t.book.kinds.income} selected={kind === "income"} onPress={() => setKind("income")} />
      </View>
      {kind === "expense" ? (
        <>
          <TextField label={t.book.budget} value={budgetText} onChangeText={setBudgetText} placeholder="3000" keyboardType="decimal-pad" maxLength={12} />
          <Text variant="small" color={palette.inkSoft}>
            {plain(t.book.budgetHint)}
          </Text>
        </>
      ) : null}
      {circles.length ? (
        <>
          {label(t.book.share)}
          <View style={styles.row}>
            <Chip icon="lock-closed-outline" label={t.book.justMe} selected={circleId === null} onPress={() => setCircleId(null)} />
            {circles.map((c) => (
              <Chip key={c.id} icon="people-outline" tone={c.kind === "family" ? "family" : "primary"} label={c.name} selected={circleId === c.id} onPress={() => setCircleId(c.id)} />
            ))}
          </View>
          {circleId ? <Note icon="people-outline">{plain(t.book.shareHint)}</Note> : null}
        </>
      ) : null}
      {twin ? <Note icon="information-circle-outline">{fill(t.book.twin, { name: twin.name })}</Note> : null}
      <Button label={twin ? twin.name : t.book.create} icon={twin ? "arrow-forward" : "add"} size="lg" block disabled={!ready} onPress={submit} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.md },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
