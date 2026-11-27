import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router, type Href } from "expo-router";
import { t } from "@/i18n";
import { respondDaftar, respondTask } from "@/lib/api";
import { pullItems } from "@/sync/items";
import { Button, glass, IconTile, type IconKind, type IconName, notify, palette, radius, space, Text } from "@/ui";
import type { NeedKind, NeedRow as Need } from "./needs";

// One meaning per icon across the app; the colour says what it is about.
const ICON: Record<NeedKind, IconName> = { task: "checkmark-circle-outline", homework_review: "school-outline", daftar: "wallet-outline", split: "pie-chart-outline" };
const KIND: Record<NeedKind, IconKind> = { task: "people", homework_review: "primary", daftar: "money", split: "place" };

/**
 * One thing that waits for this person: what it is, one line, one answer. The button answers in
 * place when the answer is a plain yes (a request, a Daftar entry: the other person hears of it, so
 * the row stays until the server has said so), else it opens the thing's own screen, as the row does.
 */
export function NeedRow({ need, onAnswered }: { need: Need; onAnswered: () => void }) {
  const [busy, setBusy] = useState(false);
  const open = () => router.push(need.route as Href);
  const answer = async () => {
    if (busy || !need.action) return;
    setBusy(true);
    try {
      if (need.action.type === "accept_task") {
        await respondTask(need.id, "accept");
        // An accepted request becomes one of this person's plans.
        void pullItems();
      } else await respondDaftar(need.id, "confirm");
      onAnswered();
    } catch {
      notify(need.kind === "daftar" ? t.daftar.failed : t.tasks.failed, "error");
      setBusy(false);
    }
  };
  const label = need.action?.type === "accept_task" ? t.lay.today.yes : need.action?.type === "confirm_daftar" ? t.lay.today.right : need.kind === "homework_review" ? t.lay.today.review : t.lay.common.open;
  return (
    <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`${need.title}, ${need.line}`} style={({ pressed }) => [styles.row, pressed && styles.pressed, busy && styles.dim]}>
      <IconTile name={ICON[need.kind]} kind={KIND[need.kind]} size={40} />
      <View style={styles.text}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {need.title}
        </Text>
        <Text variant="small" color={palette.inkSoft} numberOfLines={1}>
          {need.line}
        </Text>
      </View>
      <Button label={label} size="sm" kind="tonal" busy={busy} disabled={busy} onPress={need.action ? () => void answer() : open} accessibilityLabel={`${label}: ${need.title}`} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { ...glass, flexDirection: "row", alignItems: "center", gap: space.md, borderRadius: radius.lg, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 64 },
  pressed: { backgroundColor: palette.wash },
  dim: { opacity: 0.6 },
  text: { flex: 1, minWidth: 0, gap: 2 },
});
