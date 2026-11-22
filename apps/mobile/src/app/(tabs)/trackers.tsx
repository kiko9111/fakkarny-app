import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import type { Tracker } from "@fakkarni/shared";
import { t } from "@/i18n";
import { addRamadanPack, listTrackers } from "@/lib/api";
import { canAdd } from "@/trackers/logic";
import { TrackerCard } from "@/trackers/TrackerCard";
import { Button, Card, EmptyState, Note, notify, palette, Screen, Text } from "@/ui";

/** Everything the user follows (Today shows the same cards; this page also holds the Ramadan pack). */
export default function TrackersScreen() {
  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [limit, setLimit] = useState<number | null>(1);
  const [ramadan, setRamadan] = useState<"available" | "added" | "off">("off");
  const [state, setState] = useState<"loading" | "ready" | "offline">("loading");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await listTrackers();
      setTrackers(res.trackers);
      setLimit(res.limit);
      setRamadan(res.ramadan_pack);
      setState("ready");
    } catch {
      setState((s) => (s === "ready" ? s : "offline"));
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const replace = (next: Tracker) => setTrackers((all) => all.map((x) => (x.id === next.id ? next : x)));
  const own = trackers.filter((x) => !x.pack).length;
  const add = () => (canAdd(own, limit) ? router.push("/tracker/new") : router.push("/paywall"));

  return (
    <Screen
      keyboard
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load().finally(() => setRefreshing(false));
      }}
    >
      {ramadan === "available" ? (
        <Card onPress={() => void addRamadanPack().then(load).catch(() => notify(t.trackers.failed, "error"))} tone={palette.friendsSoft}>
          <Text variant="headline" color={palette.friends}>
            {t.ramadan.addPack}
          </Text>
          <Text variant="small" color={palette.inkSoft}>
            {t.ramadan.packHint}
          </Text>
        </Card>
      ) : null}
      {state === "offline" ? <Note icon="cloud-offline-outline">{t.trackers.offline}</Note> : null}
      {state === "ready" && trackers.length === 0 ? <EmptyState title={t.trackers.empty} /> : null}
      {trackers.map((tr) => (
        <TrackerCard key={tr.id} tracker={tr} onChanged={replace} onRemoved={() => void load()} />
      ))}
      {state === "ready" ? <Button label={canAdd(own, limit) ? t.trackers.add : t.trackers.addPro} kind={canAdd(own, limit) ? "tonal" : "outline"} icon={canAdd(own, limit) ? "add" : "sparkles"} block onPress={add} /> : null}
      {state === "ready" && trackers.length > 0 ? (
        <Text variant="caption" color={palette.inkSoft} align="center">
          {t.trackers.chatHint}
        </Text>
      ) : null}
    </Screen>
  );
}
