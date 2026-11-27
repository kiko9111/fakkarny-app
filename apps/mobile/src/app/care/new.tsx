import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { randomUUID } from "expo-crypto";
import { DEFAULT_MISSED_AFTER, MAX_DOSE_TIMES, type CircleDetail } from "@fakkarni/shared";
import { hhmmOf, TIME_CHOICES, toggleTime } from "@/care/logic";
import { doseClock } from "@/care/clock";
import { memberName } from "@/circles/useCircle";
import { t } from "@/i18n";
import { track } from "@/lib/analytics";
import { createMed, getCircle, peekCare, peekCircle, updateMed } from "@/lib/api";
import { Button, Chip, DateTimePicker, notify, palette, Screen, space, Text, TextField } from "@/ui";

const AFTER = [
  [30, "m30"],
  [60, "h1"],
  [120, "h2"],
] as const;

/**
 * Add (or, with `edit`, change) a medicine in a care circle: who takes it, its name and dose as
 * the doctor wrote them, the times, who gets the reminder, and how long Zaki waits before telling
 * the family nobody marked it. One screen of taps; only the names need typing.
 */
export default function NewMedScreen() {
  const params = useLocalSearchParams<{ circle?: string; edit?: string }>();
  const editing = params.edit ? (peekCare()?.find((m) => m.id === params.edit) ?? null) : null;
  const circleId = editing?.circle_id ?? params.circle ?? "";
  const [circle, setCircle] = useState<CircleDetail | null>(() => (circleId ? peekCircle(circleId) : null));
  const [personId, setPersonId] = useState<string | null>(editing?.person_user_id ?? null);
  const [person, setPerson] = useState(editing && !editing.person_user_id ? editing.person_name : "");
  const [name, setName] = useState(editing?.name ?? "");
  const [dose, setDose] = useState(editing?.dose ?? "");
  const [times, setTimes] = useState<string[]>(editing?.times ?? ["08:00", "20:00"]);
  const [remind, setRemind] = useState<string[]>(editing?.remind_user_ids ?? []);
  const [after, setAfter] = useState<number>(editing?.missed_after_minutes ?? DEFAULT_MISSED_AFTER);
  const [note, setNote] = useState(editing?.note ?? "");
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [id] = useState(() => randomUUID());

  useEffect(() => {
    if (!circleId) return;
    getCircle(circleId).then(setCircle, () => {});
  }, [circleId]);

  const members = useMemo(() => circle?.members ?? [], [circle]);
  const me = members.find((m) => m.is_me);
  // Nobody picked yet: the one who takes it if they are in the circle, else the one adding it.
  useEffect(() => {
    if (editing || remind.length || !me) return;
    setRemind([personId ?? me.user_id]);
  }, [editing, remind.length, me, personId]);

  const pickedMember = members.find((m) => m.user_id === personId);
  const personName = pickedMember ? (pickedMember.name ?? "") : person.trim();
  const ok = Boolean(circleId) && personName.length > 0 && name.trim().length > 0 && times.length > 0 && remind.length > 0;
  const toggleRemind = (uid: string) => setRemind((r) => (r.includes(uid) ? r.filter((x) => x !== uid) : [...r, uid]));

  const save = async () => {
    if (!ok || busy) return;
    setBusy(true);
    const body = {
      person_name: personName,
      person_user_id: personId,
      name: name.trim(),
      dose: dose.trim() || null,
      times,
      remind_user_ids: remind,
      missed_after_minutes: after,
      note: note.trim() || null,
    };
    try {
      if (editing) await updateMed(editing.id, body);
      else {
        await createMed({ ...body, id, circle_id: circleId });
        track("care_med_added", { times: times.length });
      }
      router.back();
    } catch {
      setBusy(false);
      notify(t.lay.care.failed, "error");
    }
  };

  const heading = (title: string) => (
    <Text variant="smallStrong" color={palette.inkSoft}>
      {title}
    </Text>
  );

  return (
    <Screen keyboard contentStyle={styles.content}>
      <Stack.Screen options={{ title: editing ? t.lay.care.editTitle : t.lay.care.newTitle }} />

      {heading(t.lay.care.who)}
      <View style={styles.chips}>
        {members.map((m) => (
          <Chip key={m.user_id} icon="person-outline" tone="family" label={memberName(m)} selected={personId === m.user_id} onPress={() => setPersonId(m.user_id)} />
        ))}
        <Chip icon="heart-outline" tone="family" label={t.lay.care.someoneElse} selected={personId === null} onPress={() => setPersonId(null)} />
      </View>
      {personId === null ? <TextField value={person} onChangeText={setPerson} placeholder={t.lay.care.personPlaceholder} maxLength={40} /> : null}

      <TextField label={t.lay.care.medName} value={name} onChangeText={setName} maxLength={60} />
      <TextField value={dose} onChangeText={setDose} placeholder={t.lay.care.dose} maxLength={60} />

      {heading(t.lay.care.times)}
      <View style={styles.chips}>
        {[...new Set([...TIME_CHOICES, ...times])].sort().map((time) => (
          <Chip key={time} icon="notifications-outline" label={doseClock(time)} selected={times.includes(time)} onPress={() => setTimes(toggleTime(times, time))} />
        ))}
        {times.length < MAX_DOSE_TIMES ? <Chip icon="add" label={t.lay.care.otherTime} onPress={() => setPicking(true)} /> : null}
      </View>
      {picking ? (
        <DateTimePicker
          onCancel={() => setPicking(false)}
          onDone={(d) => {
            setTimes((x) => (x.includes(hhmmOf(d)) ? x : toggleTime(x, hhmmOf(d))));
            setPicking(false);
          }}
        />
      ) : null}

      {members.length > 0 ? (
        <>
          {heading(t.lay.care.remind)}
          <View style={styles.chips}>
            {members.map((m) => (
              <Chip key={m.user_id} label={memberName(m)} selected={remind.includes(m.user_id)} onPress={() => toggleRemind(m.user_id)} />
            ))}
          </View>
        </>
      ) : null}

      {heading(t.lay.care.tellAfter)}
      <View style={styles.chips}>
        {AFTER.map(([min, key]) => (
          <Chip key={key} label={t.lay.care.after[key]} selected={after === min} onPress={() => setAfter(min)} />
        ))}
      </View>

      <TextField value={note} onChangeText={setNote} placeholder={t.lay.care.note} maxLength={200} />
      <Text variant="small" color={palette.inkSoft}>
        {t.lay.care.safety}
      </Text>
      <Button label={t.lay.care.save} size="lg" block busy={busy} disabled={!ok} onPress={() => void save()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
