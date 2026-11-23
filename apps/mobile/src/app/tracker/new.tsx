import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { TRACKER_TEMPLATES, TrackerKind, type Circle } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { parseAmount } from "@/daftar/logic";
import { dateLocale, t } from "@/i18n";
import { createTracker, listCircles } from "@/lib/api";
import { HttpError } from "@/sync/queue";
import { TRACKER_ICON } from "@/trackers/TrackerCard";
import { ASK_TIME_CHOICES, askTimeLabel, MAX_ASK, toggleAskTime } from "@/trackers/logic";
import { Button, Chip, notify, palette, plain, Screen, space, Text, TextField, ZakiAvatar } from "@/ui";

const GOALS = [1, 2, 3, 5, 8, 10];
type Step = "what" | "goal" | "ask" | "share";

/**
 * The tracker builder: what to follow (a template or any words), a daily goal, when Zaki asks,
 * and whether a circle sees it. Each step is one screen of taps; only the name needs typing.
 * Shown once after sign-up (`first`, the first tracker is Zaki's gift), from the Trackers tab,
 * and from a chat suggestion (`name`).
 */
export default function NewTrackerScreen() {
  const params = useLocalSearchParams<{ first?: string; name?: string; circle?: string }>();
  const [kind, setKind] = useState<TrackerKind | null>(params.name ? "custom" : null);
  const [name, setName] = useState(params.name ?? "");
  const [goal, setGoal] = useState<number | null>(null);
  const [goalText, setGoalText] = useState("");
  const [unit, setUnit] = useState("");
  const [times, setTimes] = useState<string[]>(["21:00"]);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [circleId, setCircleId] = useState<string | null>(params.circle ?? null);
  const [step, setStep] = useState<Step>("what");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listCircles()
      .then(setCircles)
      .catch(() => setCircles([]));
  }, []);

  const tpl = kind ? TRACKER_TEMPLATES[kind] : null;
  const money = tpl?.unit === "money";
  // Money is never shared; a savings target is typed, other money trackers have no goal step.
  const steps: Step[] = !kind ? ["what"] : money ? (kind === "savings" ? ["what", "goal", "ask"] : ["what", "ask"]) : circles.length ? ["what", "goal", "ask", "share"] : ["what", "goal", "ask"];
  const at = steps.indexOf(step);
  const last = at === steps.length - 1;
  const typedGoal = parseAmount(goalText);
  const okWhat = kind !== null && (kind !== "custom" || name.trim().length > 0);
  const okGoal = goalText.trim() === "" || typedGoal !== null;

  const pick = (k: TrackerKind) => {
    setKind(k);
    setGoal(TRACKER_TEMPLATES[k].goal);
    setGoalText("");
  };

  const submit = async () => {
    if (!kind || busy) return;
    setBusy(true);
    const finalGoal = typedGoal ?? goal;
    try {
      await createTracker({
        kind,
        ...(kind === "custom" ? { name: name.trim(), ...(unit.trim() ? { unit_label: unit.trim() } : {}) } : {}),
        ...(finalGoal !== null ? { goal: finalGoal } : {}),
        ask_times: times,
        ...(circleId && !money ? { circle_id: circleId } : {}),
      });
      if (params.first) router.replace("/today");
      else router.back();
    } catch (err) {
      setBusy(false);
      // 402: the free tracker is already in use (a returning user sees the one they have).
      if (err instanceof HttpError && err.status === 402) router.replace(params.first ? "/today" : "/paywall");
      else notify(t.trackers.failed, "error");
    }
  };

  const next = () => (last ? void submit() : setStep(steps[at + 1]!));
  const heading = (title: string, hint?: string) => (
    <View style={styles.hero}>
      <ZakiAvatar size={56} glow />
      <Text variant="title" align="center">
        {plain(title)}
      </Text>
      {hint ? (
        <Text variant="body" color={palette.inkSoft} align="center">
          {plain(hint)}
        </Text>
      ) : null}
    </View>
  );

  return (
    <Screen keyboard contentStyle={styles.content}>
      <Stack.Screen options={{ title: t.trackers.newTitle }} />
      {steps.length > 1 ? (
        <Text variant="smallStrong" color={palette.inkSoft} align="center">
          {fill(t.trackers.stepOf, { n: at + 1, total: steps.length })}
        </Text>
      ) : null}

      {step === "what" ? (
        <>
          {heading(params.first ? t.trackers.firstTitle : t.trackers.pick, params.first ? t.trackers.firstHint : undefined)}
          <View style={styles.row}>
            {TrackerKind.options.map((k) => (
              <Chip key={k} icon={TRACKER_ICON[k]} label={plain(t.trackers.kinds[k])} selected={kind === k} onPress={() => pick(k)} />
            ))}
          </View>
          <TextField
            value={name}
            onChangeText={(v) => {
              setName(v);
              if (v.trim() && kind !== "custom") pick("custom");
            }}
            placeholder={t.trackers.anyName}
            maxLength={40}
          />
        </>
      ) : null}

      {step === "goal" ? (
        <>
          {heading(kind === "savings" ? t.trackers.savingsGoal : t.trackers.goalTitle, kind === "savings" ? undefined : t.trackers.goalHint)}
          {kind !== "savings" ? (
            <View style={styles.row}>
              <Chip label={t.trackers.noGoal} selected={goal === null && !goalText} onPress={() => (setGoal(null), setGoalText(""))} />
              {GOALS.map((g) => (
                <Chip key={g} label={String(g)} selected={goal === g && !goalText} onPress={() => (setGoal(g), setGoalText(""))} />
              ))}
            </View>
          ) : null}
          <TextField value={goalText} onChangeText={setGoalText} placeholder={kind === "savings" ? t.trackers.amount : "12"} keyboardType="decimal-pad" maxLength={12} />
          {kind === "custom" ? <TextField value={unit} onChangeText={setUnit} placeholder={t.trackers.unitLabel} maxLength={20} /> : null}
        </>
      ) : null}

      {step === "ask" ? (
        <>
          {heading(t.trackers.askTitle, t.trackers.askHint)}
          <View style={styles.row}>
            <Chip label={t.trackers.askNone} selected={times.length === 0} onPress={() => setTimes([])} />
            {ASK_TIME_CHOICES.map((time) => (
              <Chip
                key={time}
                icon="alarm-outline"
                label={askTimeLabel(time, dateLocale)}
                selected={times.includes(time)}
                onPress={() => (times.length >= MAX_ASK && !times.includes(time) ? undefined : setTimes(toggleAskTime(times, time)))}
              />
            ))}
          </View>
          {money ? <Text variant="small" color={palette.inkSoft} align="center">{plain(t.trackers.moneyPrivate)}</Text> : null}
        </>
      ) : null}

      {step === "share" ? (
        <>
          {heading(t.trackers.shareTitle, t.trackers.shareHint)}
          <View style={styles.row}>
            <Chip icon="lock-closed-outline" label={t.trackers.justMe} selected={circleId === null} onPress={() => setCircleId(null)} />
            {circles.map((c) => (
              <Chip key={c.id} icon="people-outline" tone={c.kind === "family" ? "family" : "primary"} label={c.name} selected={circleId === c.id} onPress={() => setCircleId(c.id)} />
            ))}
          </View>
        </>
      ) : null}

      <Button label={last ? t.trackers.start : t.trackers.next} size="lg" block busy={busy} disabled={step === "what" ? !okWhat : step === "goal" ? !okGoal : false} onPress={next} />
      {at > 0 ? <Button kind="text" label={t.trackers.back} onPress={() => setStep(steps[at - 1]!)} /> : null}
      {params.first && at === 0 ? <Button kind="text" label={t.trackers.later} onPress={() => router.replace("/")} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.lg },
  hero: { alignItems: "center", gap: space.sm, marginTop: space.sm },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, justifyContent: "center" },
});
