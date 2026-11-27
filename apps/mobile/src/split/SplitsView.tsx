import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import type { Split } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { formatMoney } from "@/daftar/logic";
import { t, dateLocale } from "@/i18n";
import { listSplits, peekSplits } from "@/lib/api";
import { IntroPanel, ListRow, LoadingCards, Note, space } from "@/ui";

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

  return (
    <View style={styles.list}>
      {offline && splits === null ? <Note icon="cloud-offline-outline">{t.split.offline}</Note> : null}
      {!offline && splits === null ? <LoadingCards count={2} tile={false} /> : null}
      {splits !== null && splits.length === 0 ? <IntroPanel title={t.lay.daftar.splitsEmpty} action={t.lay.daftar.addSplit} onAction={() => router.push("/split/new")} /> : null}
      {splits?.map((s) => {
        const left = s.paid_by === null ? 0 : s.people.filter((p, i) => i !== s.paid_by && !p.paid).length;
        return (
          <ListRow
            key={s.id}
            title={s.title || t.split.untitled}
            meta={`${new Date(s.created_at).toLocaleDateString(dateLocale, { day: "numeric", month: "short" })} · ${fill(t.ui.pounds, { n: formatMoney(s.total) })}${left ? ` · ${fill(t.split.leftToPay, { n: left })}` : ""}${s.mine === false && s.owner_name ? ` · ${fill(t.split.from, { name: s.owner_name })}` : ""}`}
            onPress={() => router.push({ pathname: "/split/[id]", params: { id: s.id } })}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({ list: { gap: space.md } });
