import { useMemo, useState } from "react";
import { router, type Href } from "expo-router";
import { t } from "@/i18n";
import { peekCircles, peekLists } from "@/lib/api";
import { photosAvailable } from "@/lib/photos";
import type { Feature } from "@/lib/unlock";
import { unlock } from "@/lib/unlock-store";
import { AddSheet, type AddAction, type IconKind, type IconName } from "@/ui";
import { plusActions, type PlusKey, type PlusRow } from "./plus";

// One meaning per icon across the app (the layout spec's list).
const ICON: Record<PlusKey, IconName> = {
  remind: "notifications-outline",
  list: "cart-outline",
  ask: "checkmark-circle-outline",
  homework: "school-outline",
  split: "pie-chart-outline",
  receipt: "camera-outline",
};

const KIND: Record<PlusKey, IconKind> = { remind: "alarm", list: "primary", ask: "people", homework: "primary", split: "place", receipt: "money" };

type Pick = { place: Feature | null; circles: { id: string; name: string; route: string }[] };

/** Starting a job from the chat also opens its place for someone who had not opened it yet. */
function go(route: string, place: Feature | null) {
  if (place) unlock.open(place);
  router.push(route as Href);
}

/**
 * The sheet behind the "+" beside the composer: every job that can be started from the chat.
 * Which rows show is decided in chat/plus.ts from the saved copies (no request, no wait).
 */
export function PlusMenu({ visible, onClose, onRemind }: { visible: boolean; onClose: () => void; onRemind: () => void }) {
  // Read from the saved copies whenever the sheet opens, so a circle made a minute ago is there.
  const rows = useMemo<PlusRow[]>(() => plusActions({ photos: photosAvailable, lists: peekLists() !== null, circles: peekCircles() ?? [] }), [visible]);
  // The second step, when more than one circle fits. Its rows stay while the sheet fades out.
  const [pick, setPick] = useState<Pick | null>(null);
  const [picking, setPicking] = useState(false);

  const actions: AddAction[] = rows.map((row) => ({
    key: row.key,
    icon: ICON[row.key],
    kind: KIND[row.key],
    label: t.lay.chat[row.key],
    onPress: () => {
      const step = row.step;
      if ("compose" in step) onRemind();
      else if ("go" in step) go(step.go, row.place);
      else {
        setPick({ place: row.place, circles: step.pick });
        setPicking(true);
      }
    },
  }));
  const circles: AddAction[] = (pick?.circles ?? []).map((c) => ({ key: c.id, icon: "people-outline", kind: "people", label: c.name, onPress: () => go(c.route, pick!.place) }));

  return (
    <>
      <AddSheet visible={visible} onClose={onClose} title={t.lay.chat.plus} actions={actions} />
      <AddSheet visible={picking} onClose={() => setPicking(false)} title={t.lay.chat.whichCircle} actions={circles} />
    </>
  );
}
