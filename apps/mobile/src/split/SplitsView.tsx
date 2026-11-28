import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import type { Split } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { formatMoney } from "@/daftar/logic";
import { t, dateLocale } from "@/i18n";
import { listSplits, peekSplits } from "@/lib/api";
import { splitSide, splitTotals } from "@/daftar/layout";
import { Icon, IconTile, IntroPanel, LoadingCards, Note, palette, Rows, space, StatStrip, Text } from "@/ui";

/** The Daftar's Splits part: the recent splits. A new one starts from the tab's "+" (money.tsx). */
export function SplitsView({ reloadKey }: { reloadKey: number }) {
  const [splits, setSplits] = useState<Split[] | null>(() => peekSplits());
  const [offline, setOffline] = useState(false);
  const load = useCallback(() => {
    listSplits()
      .then((s) => {
        setSplits(s);
        setOffline(false);
      })
      .catch(() => setOffline(true));
  }, []);
  useEffect(load, [load, reloadKey]);

  const totals = splitTotals(splits ?? []);
  const money = (n: number) => fill(t.ui.pounds, { n: formatMoney(n) });

  return (
    <View style={styles.list}>
      {offline && splits === null ? <Note icon="cloud-offline-outline">{t.split.offline}</Note> : null}
      {!offline && splits === null ? <LoadingCards count={2} tile={false} /> : null}
      {splits !== null && splits.length === 0 ? <IntroPanel title={t.lay.daftar.splitsEmpty} action={t.lay.daftar.addSplit} onAction={() => router.push("/split/new")} /> : null}
      {splits?.length ? (
        <StatStrip
          cells={[
            { key: "open", value: String(totals.open), label: t.lay.daftar.openBills },
            { key: "owe", value: money(totals.iOwe), label: t.ui.youOwe, tone: totals.iOwe > 0 ? "warn" : undefined },
            { key: "owed", value: money(totals.owedToMe), label: t.ui.owedToYou, tone: totals.owedToMe > 0 ? "ok" : undefined },
          ]}
        />
      ) : null}
      <Rows>
        {(splits ?? []).map((s) => {
          const side = splitSide(s);
          // The reader's side first; the date and the bill's total after it.
          const mine = side.says === "you_owe" ? fill(t.lay.daftar.splitYouOwe, { amount: money(side.amount) }) : side.says === "owed" ? fill(t.lay.daftar.splitOwed, { amount: money(side.amount) }) : side.says === "settled" ? t.lay.daftar.splitSettled : "";
          const rest = `${new Date(s.created_at).toLocaleDateString(dateLocale, { day: "numeric", month: "short" })} · ${money(s.total)}${s.mine === false && s.owner_name ? ` · ${fill(t.split.from, { name: s.owner_name })}` : ""}`;
          const title = s.title || t.split.untitled;
          return (
            <Pressable key={s.id} onPress={() => router.push({ pathname: "/split/[id]", params: { id: s.id } })} accessibilityRole="button" accessibilityLabel={[title, mine, rest].filter(Boolean).join(", ")} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <IconTile name="pie-chart-outline" kind="place" size={36} />
              <View style={styles.flex}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {title}
                </Text>
                <Text variant="small" color={palette.inkSoft} numberOfLines={1}>
                  {mine ? (
                    <Text variant="smallStrong" color={side.says === "you_owe" ? palette.warn : side.says === "owed" ? palette.ok : palette.inkSoft}>
                      {mine}
                      {" · "}
                    </Text>
                  ) : null}
                  {rest}
                </Text>
              </View>
              <Icon name="chevron-forward" size={18} color={palette.inkFaint} />
            </Pressable>
          );
        })}
      </Rows>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.md },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm, minHeight: 60 },
  pressed: { backgroundColor: palette.wash },
  flex: { flex: 1, minWidth: 0 },
});
