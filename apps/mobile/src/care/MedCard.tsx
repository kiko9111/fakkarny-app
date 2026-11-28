import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { guessDose, type CareDose, type CareMed, type DoseState } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { t } from "@/i18n";
import { markDose, peekMe, savedMed } from "@/lib/api";
import { useGuess } from "@/lib/optimistic";
import { track } from "@/lib/analytics";
import { QueuedOffline } from "@/sync/writes";
import { ask, Badge, Card, Icon, IconTile, notify, palette, space, Text, type IconName } from "@/ui";
import { doseClock } from "./clock";
import { canTap } from "./logic";

const offline = (err: unknown) => err instanceof QueuedOffline;
export { doseClock };

const LOOK: Record<DoseState, { icon: IconName; fg: string; bg: string }> = {
  taken: { icon: "checkmark-circle", fg: palette.ok, bg: palette.okSoft },
  skipped: { icon: "remove-circle-outline", fg: palette.inkSoft, bg: palette.wash },
  missed: { icon: "alert-circle", fg: palette.warn, bg: palette.warnSoft },
  due: { icon: "ellipse-outline", fg: palette.primaryInk, bg: palette.primarySoft },
  later: { icon: "time-outline", fg: palette.inkSoft, bg: palette.wash },
};

/** One dose as a pill: its time and state. Tapping an open one marks it taken. */
export function DosePill({ dose, onPress, label }: { dose: CareDose; onPress?: () => void; label?: string }) {
  const look = LOOK[dose.state];
  const words = `${doseClock(dose.time)} · ${t.lay.care.state[dose.state]}${dose.by_name ? ` · ${dose.by_me ? t.lay.care.you : dose.by_name}` : ""}`;
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole="button" accessibilityLabel={words} style={({ pressed }) => [styles.pill, { backgroundColor: look.bg }, pressed && styles.pressed]}>
      <Icon name={look.icon} size={16} color={look.fg} />
      <Text variant="smallStrong" color={palette.ink}>
        {label ?? doseClock(dose.time)}
      </Text>
    </Pressable>
  );
}

/** Mark one dose: shown at once, sent in tap order; offline it waits on the phone and stays drawn. */
export function useDoseMarks(med: CareMed, onSaved?: (m: CareMed) => void) {
  const { shown, run } = useGuess<CareMed>(med);
  const me = peekMe()?.name ?? null;
  const mark = (dose: CareDose, status: "taken" | "skipped" | "open") => {
    const next = (m: CareMed) => guessDose(m, dose.due_at, status, new Date(), me);
    if (status !== "open") track("care_dose_marked", { status });
    run(() => markDose(med.id, { due_at: dose.due_at, status }), { next, adopt: (a) => a, keep: offline })
      .then((answer) => onSaved?.(answer))
      .catch((err) => {
        if (offline(err)) {
          savedMed(next(shown));
          return;
        }
        notify(t.lay.care.failed, "error");
      });
  };
  /** A tap on a dose: an open one is taken; a marked one asks what to change. */
  const tap = (dose: CareDose) => {
    if (dose.state === "taken" || dose.state === "skipped") {
      const other = dose.state === "taken" ? "skipped" : "taken";
      ask(fill(t.lay.care.doseQuestion, { time: doseClock(dose.time) }), fill(t.lay.care.markedBy, { what: t.lay.care.state[dose.state], name: dose.by_me ? t.lay.care.you : (dose.by_name ?? "") }), [
        { label: t.lay.care.undo, onPress: () => mark(dose, "open") },
        { label: t.lay.care[other], onPress: () => mark(dose, other) },
        { label: t.ui.cancel, style: "cancel" },
      ]);
      return;
    }
    if (!canTap(dose, new Date())) {
      if (Date.parse(dose.due_at) < Date.now()) notify(t.lay.care.tooLate, "info");
      return;
    }
    mark(dose, "taken");
  };
  return { med: shown, tap, mark };
}

/** A medicine in a circle's list: who takes it, today's doses as pills, and what waits from before. */
export function MedCard({ med: fromList }: { med: CareMed }) {
  const { med, tap } = useDoseMarks(fromList);
  const who = med.for_me ? t.lay.care.you : med.person_name;
  return (
    <Card style={styles.card}>
      <Pressable onPress={() => router.push({ pathname: "/care/[id]", params: { id: med.id } })} accessibilityRole="button" accessibilityLabel={`${med.name} · ${who}`} style={styles.head}>
        <IconTile name="medkit-outline" kind="people" size={40} />
        <View style={styles.flex}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {med.name}
          </Text>
          <Text variant="small" color={palette.inkSoft} numberOfLines={1}>
            {[who, med.dose].filter(Boolean).join(" · ")}
          </Text>
        </View>
        {med.active ? <Icon name="chevron-forward" size={18} color={palette.inkFaint} /> : <Badge label={t.lay.care.paused} />}
      </Pressable>
      {med.active ? (
        <View style={styles.pills}>
          {med.open_missed.map((d) => (
            <DosePill key={d.due_at} dose={d} label={`${t.lay.care.yesterday} ${doseClock(d.time)}`} onPress={() => tap(d)} />
          ))}
          {med.today.map((d) => (
            <DosePill key={d.due_at} dose={d} onPress={() => tap(d)} />
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
  flex: { flex: 1, minWidth: 0 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  pill: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: 999, minHeight: 36 },
  pressed: { opacity: 0.7 },
});
