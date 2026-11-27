import { useCallback, useState } from "react";
import { useLive } from "@/lib/live";
import { router } from "expo-router";
import type { ListTrackersResponse, Tracker } from "@fakkarni/shared";
import { t } from "@/i18n";
import { failText } from "@/lib/errors";
import { addRamadanPack, listTrackers, peekTrackers } from "@/lib/api";
import { canAdd } from "@/trackers/logic";
import { TrackerCard } from "@/trackers/TrackerCard";
import { Button, Card, EmptyState, Note, notify, palette, Screen, Text } from "@/ui";

/** Everything the user follows (Today shows the same cards; this page also holds the Ramadan pack). */
export default function TrackersScreen() {
  const saved = useState(() => peekTrackers())[0];
  const [trackers, setTrackers] = useState<Tracker[]>(saved?.trackers ?? []);
  const [limit, setLimit] = useState<number | null>(saved ? saved.limit : 1);
  const [ramadan, setRamadan] = useState<"available" | "added" | "off">("off");
  const [why, setWhy] = useState(t.trackers.offline);
  const [state, setState] = useState<"loading" | "ready" | "offline">(saved ? "ready" : "loading");

  const load = useCallback(async () => {
    const show = (res: ListTrackersResponse) => {
      setTrackers(res.trackers);
      setLimit(res.limit);
      setRamadan(res.ramadan_pack);
      setState("ready");
    };
    // What the phone holds first (a step logged on Today is already in it), then the server.
    const held = peekTrackers();
    if (held) show(held);
    try {
      show(await listTrackers());
    } catch (err) {
      setWhy(failText(err, t.trackers.offline));
      setState((s) => (s === "ready" ? s : "offline"));
    }
  }, []);
  useLive(load);

  const replace = (next: Tracker) => setTrackers((all) => all.map((x) => (x.id === next.id ? next : x)));
  const own = trackers.filter((x) => !x.pack).length;
  const add = () => (canAdd(own, limit) ? router.push("/tracker/new") : router.push("/paywall"));

  return (
    <Screen
      keyboard
      onRefresh={load}
    >
      {ramadan === "available" ? (
        <Card onPress={() => void addRamadanPack().then(load).catch(() => notify(t.trackers.failed, "error"))} tone={palette.friendsSoft}>
          <Text variant="headline" color={palette.friends}>
            {t.ramadan.addPack}
          </Text>
        </Card>
      ) : null}
      {state === "offline" ? <Note icon="cloud-offline-outline">{why}</Note> : null}
      {state === "ready" && trackers.length === 0 ? <EmptyState title={t.trackers.empty} /> : null}
      {trackers.map((tr) => (
        <TrackerCard key={tr.id} tracker={tr} onChanged={replace} onRemoved={() => void load()} />
      ))}
      {state === "ready" ? <Button label={canAdd(own, limit) ? t.trackers.add : t.trackers.addPro} kind={canAdd(own, limit) ? "tonal" : "outline"} icon={canAdd(own, limit) ? "add" : "sparkles"} block onPress={add} /> : null}
    </Screen>
  );
}
