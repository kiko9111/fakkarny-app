import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router, type Href } from "expo-router";
import { t } from "@/i18n";
import { markDose, markGameyaPaid, markSplitPaid, respondDaftar, respondTask, savedMed, peekCare } from "@/lib/api";
import { guessDose } from "@fakkarni/shared";
import { QueuedOffline } from "@/sync/writes";
import { pullItems } from "@/sync/items";
import { Button, glass, IconTile, type IconKind, type IconName, notify, palette, radius, space, Text } from "@/ui";
import type { NeedKind, NeedRow as Need } from "./needs";

// One meaning per icon across the app; the colour says what it is about.
const ICON: Record<NeedKind, IconName> = { dose: "medkit-outline", task: "checkmark-circle-outline", homework_review: "school-outline", daftar: "wallet-outline", split: "pie-chart-outline", gameya: "sync-circle-outline" };
const KIND: Record<NeedKind, IconKind> = { dose: "people", task: "people", homework_review: "primary", daftar: "money", split: "place", gameya: "money" };

/**
 * One thing that waits for this person: what it is, one line, one answer. The button answers in
 * place when the answer is a plain yes (a request, a Daftar entry: the other person hears of it, so
 * the row stays until the server has said so), else it opens the thing's own screen, as the row does.
 */
export function NeedRow({ need, onAnswered, flat }: { need: Need; onAnswered: () => void; flat?: boolean }) {
  const [busy, setBusy] = useState(false);
  const open = () => router.push(need.route as Href);
  /** A way back for an answer that is this person's own mark (a dose, "I paid"): nobody has to be asked. */
  const undoable = (text: string, back: () => Promise<unknown>) =>
    notify(text, "ok", {
      label: t.lay.common.undo,
      onPress: () => void back().then(onAnswered, () => notify(t.tasks.failed, "error")),
    });
  const answer = async () => {
    if (busy || !need.action) return;
    setBusy(true);
    try {
      const action = need.action;
      if (action.type === "accept_task") {
        await respondTask(need.id, "accept");
        // An accepted request becomes one of this person's plans.
        void pullItems();
      } else if (action.type === "dose_taken") {
        const { medId, dueAt } = action;
        try {
          await markDose(medId, { due_at: dueAt, status: "taken" });
          undoable(t.lay.today.markedTaken, () => markDose(medId, { due_at: dueAt, status: "open" }));
        } catch (err) {
          if (!(err instanceof QueuedOffline)) throw err;
          // Kept on the phone and sent later: the saved copy shows it taken meanwhile.
          const med = peekCare()?.find((m) => m.id === medId);
          if (med) savedMed(guessDose(med, dueAt, "taken", new Date(), null));
        }
      } else if (action.type === "pay_gameya") {
        const id = need.id.split(":")[0]!;
        await markGameyaPaid(id, action.memberId, action.round, true);
        undoable(t.lay.today.markedPaid, () => markGameyaPaid(id, action.memberId, action.round, false));
      } else if (action.type === "pay_split") {
        await markSplitPaid(need.id, action.index, true);
        undoable(t.lay.today.markedPaid, () => markSplitPaid(need.id, action.index, false));
      } else await respondDaftar(need.id, "confirm");
      onAnswered();
    } catch {
      notify(need.kind === "daftar" ? t.daftar.failed : need.kind === "gameya" ? t.lay.gameya.failed : need.kind === "dose" ? t.lay.care.failed : t.tasks.failed, "error");
      setBusy(false);
    }
  };
  const label = need.action?.type === "dose_taken" ? t.lay.care.taken : need.action?.type === "accept_task" ? t.lay.today.yes : need.action?.type === "confirm_daftar" ? t.lay.today.confirm : need.action?.type === "pay_gameya" || need.action?.type === "pay_split" ? t.lay.gameya.iPaid : need.kind === "homework_review" ? t.lay.today.review : t.lay.common.open;
  return (
    <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`${need.title}, ${need.line}`} style={({ pressed }) => [flat ? styles.flat : styles.row, pressed && styles.pressed, busy && styles.dim]}>
      <IconTile name={ICON[need.kind]} kind={KIND[need.kind]} size={flat ? 32 : 40} />
      <View style={styles.text}>
        <Text variant="bodyStrong" numberOfLines={flat ? 1 : 2}>
          {need.title}
        </Text>
        <Text variant="small" color={need.tone === "danger" ? palette.danger : need.tone === "warn" ? palette.warn : palette.inkSoft} numberOfLines={1}>
          {need.line}
        </Text>
      </View>
      <Button label={label} size="sm" kind="tonal" busy={busy} disabled={busy} onPress={need.action ? () => void answer() : open} accessibilityLabel={`${label}: ${need.title}`} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { ...glass, flexDirection: "row", alignItems: "center", gap: space.md, borderRadius: radius.lg, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 64 },
  // Inside a `Rows` card: no surface of its own.
  flat: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm, minHeight: 60 },
  pressed: { backgroundColor: palette.wash },
  dim: { opacity: 0.6 },
  text: { flex: 1, minWidth: 0, gap: 2 },
});
