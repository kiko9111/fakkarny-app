import { useCallback, useState } from "react";
import { StyleSheet } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import type { CareMed } from "@fakkarni/shared";
import { MedCard } from "@/care/MedCard";
import { t } from "@/i18n";
import { listCare, peekCare } from "@/lib/api";
import { useLive } from "@/lib/live";
import { IntroPanel, LoadingCards, palette, Screen, space, Text, useAddSheet } from "@/ui";

const ofCircle = (meds: CareMed[] | null, id: string) => meds?.filter((m) => m.circle_id === id) ?? null;

/**
 * A circle's medicines: each with today's doses as pills (tap = taken), and what nobody marked
 * since yesterday. "+" adds one. Everyone in the circle sees and marks the same doses.
 */
export default function CircleCareScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [meds, setMeds] = useState<CareMed[] | null>(() => ofCircle(peekCare(), id));
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const held = ofCircle(peekCare(), id);
    if (held) setMeds(held);
    try {
      setMeds(ofCircle(await listCare(), id));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [id]);
  useLive(load);

  const add = useAddSheet([{ key: "med", icon: "medkit-outline", kind: "people", label: t.lay.care.add, onPress: () => router.push({ pathname: "/care/new", params: { circle: id } }) }]);

  return (
    <Screen>
      <Stack.Screen options={{ title: t.lay.care.title, ...add.header }} />
      {meds === null ? (
        failed ? (
          <IntroPanel title={t.circles.offline} action={t.lay.common.tryAgain} onAction={() => void load()} />
        ) : (
          <LoadingCards count={2} />
        )
      ) : meds.length === 0 ? (
        <IntroPanel title={t.lay.care.empty} action={t.lay.care.add} onAction={add.open} />
      ) : (
        meds.map((m) => <MedCard key={m.id} med={m} />)
      )}
      <Text variant="small" color={palette.inkSoft} align="center" style={styles.safety}>
        {t.lay.care.safety}
      </Text>
      {add.sheet}
    </Screen>
  );
}

const styles = StyleSheet.create({
  safety: { marginTop: space.sm },
});
