import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import type { CareDay, CareMed } from "@fakkarni/shared";
import { doseClock } from "@/care/clock";
import { DosePill, useDoseMarks } from "@/care/MedCard";
import { fill } from "@/circles/logic";
import { memberName } from "@/circles/useCircle";
import { dateLocale, listComma, t } from "@/i18n";
import { deleteMed, getMedHistory, listCare, peekCare, peekCircle, updateMed } from "@/lib/api";
import { useLive } from "@/lib/live";
import { Button, Card, confirm, IntroPanel, LoadingCards, notify, palette, Screen, SectionHeader, space, Text } from "@/ui";

const find = (id: string) => peekCare()?.find((m) => m.id === id) ?? null;
const dayLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(dateLocale, { weekday: "short", day: "numeric", month: "short" });

/**
 * One medicine: today's doses (tap = taken), the last 7 days, who is reminded and how long Zaki
 * waits before telling the family. Edit and Pause; Delete last, red, for the one who added it or
 * the circle's owner.
 */
export default function MedScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [fromServer, setFromServer] = useState<CareMed | null>(() => find(id));
  const [days, setDays] = useState<CareDay[] | null>(null);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    const held = find(id);
    if (held) setFromServer(held);
    try {
      const m = (await listCare()).find((x) => x.id === id) ?? null;
      setFromServer(m);
      setMissing(!m);
      if (m) setDays(await getMedHistory(id));
    } catch {
      if (!find(id)) setMissing(true);
    }
  }, [id]);
  useLive(load);

  if (!fromServer) return <Screen>{missing ? <IntroPanel title={t.circles.offline} action={t.lay.common.tryAgain} onAction={() => void load()} /> : <LoadingCards count={2} />}</Screen>;
  return <MedBody med={fromServer} days={days} onSaved={setFromServer} />;
}

function MedBody({ med: fromServer, days, onSaved }: { med: CareMed; days: CareDay[] | null; onSaved: (m: CareMed) => void }) {
  const { med, tap } = useDoseMarks(fromServer, onSaved);
  const [busy, setBusy] = useState(false);
  const members = peekCircle(med.circle_id)?.members ?? [];
  const reminded = med.remind_user_ids.map((uid) => members.find((m) => m.user_id === uid)).filter((m) => m !== undefined).map(memberName);
  const who = med.for_me ? t.lay.care.you : med.person_name;
  const wait = med.missed_after_minutes >= 120 ? t.lay.care.after.h2 : med.missed_after_minutes >= 60 ? t.lay.care.after.h1 : t.lay.care.after.m30;

  const pause = async () => {
    setBusy(true);
    try {
      onSaved(await updateMed(med.id, { active: !med.active }));
    } catch {
      notify(t.lay.care.failed, "error");
    } finally {
      setBusy(false);
    }
  };
  const remove = () =>
    confirm(fill(t.lay.care.removeAsk, { name: med.name }), t.lay.care.remove, () => {
      deleteMed(med.id).then(
        () => router.back(),
        () => notify(t.lay.care.failed, "error"),
      );
    });

  return (
    <Screen>
      <Stack.Screen options={{ title: med.name }} />
      <Card style={styles.card}>
        <Text variant="headline">{[who, med.dose].filter(Boolean).join(" · ")}</Text>
        <Text variant="small" color={palette.inkSoft}>
          {med.times.map(doseClock).join(listComma)}
        </Text>
        {med.note ? <Text variant="small">{med.note}</Text> : null}
        {med.active ? (
          <View style={styles.pills}>
            {med.today.map((d) => (
              <DosePill key={d.due_at} dose={d} onPress={() => tap(d)} />
            ))}
          </View>
        ) : (
          <Text variant="smallStrong" color={palette.warn}>
            {t.lay.care.paused}
          </Text>
        )}
        {reminded.length ? (
          <Text variant="small" color={palette.inkSoft}>
            {fill(t.lay.care.reminds, { names: reminded.join(listComma) })}
          </Text>
        ) : null}
        <Text variant="small" color={palette.inkSoft}>
          {fill(t.lay.care.waits, { n: wait })}
        </Text>
      </Card>

      <SectionHeader title={t.lay.care.week} />
      <Card style={styles.card}>
        <Text variant="bodyStrong">{fill(t.lay.care.weekLine, { taken: med.week.taken, missed: med.week.missed })}</Text>
        {days === null ? null : (
          days.map((day) => (
            <View key={day.date} style={styles.day}>
              <Text variant="small" color={palette.inkSoft} style={styles.dayName} numberOfLines={1}>
                {dayLabel(day.date)}
              </Text>
              <View style={styles.pills}>
                {day.doses.map((d) => (
                  <DosePill key={d.due_at} dose={d} />
                ))}
              </View>
            </View>
          ))
        )}
      </Card>

      <View style={styles.actions}>
        <Button label={t.lay.care.edit} kind="tonal" icon="create-outline" onPress={() => router.push({ pathname: "/care/new", params: { edit: med.id } })} />
        <Button label={med.active ? t.lay.care.pause : t.lay.care.resume} kind="outline" icon={med.active ? "pause-outline" : "play-outline"} busy={busy} onPress={() => void pause()} />
      </View>
      {med.can_delete ? <Button label={t.lay.care.remove} kind="danger" icon="trash-outline" onPress={remove} /> : null}
      <Text variant="small" color={palette.inkSoft} align="center">
        {t.lay.care.safety}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, flex: 1 },
  day: { flexDirection: "row", alignItems: "center", gap: space.md, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.lineStrong },
  dayName: { width: 112 },
  actions: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
});
