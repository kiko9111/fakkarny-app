import { useCallback, useState } from "react";
import { ActivityIndicator, Linking, Pressable, Share, StyleSheet, View } from "react-native";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import type { SplitResponse } from "@fakkarni/shared";
import { fill, whatsappShareUrl } from "@/circles/logic";
import { formatMoney } from "@/daftar/logic";
import { t } from "@/i18n";
import { createDaftar, deleteSplit, getSplit, markSplitPaid, peekSplit } from "@/lib/api";
import { prefs } from "@/lib/prefs";
import { track } from "@/lib/analytics";
import { daftarFromSplit } from "@/split/logic";
import { shareSplitCard } from "@/share/card";
import { Badge, Button, Card, confirm, EmptyState, Icon, notify, palette, Screen, space, Text } from "@/ui";

/** One split: everyone's share, what friends added from the link, and who has paid back. */
export default function SplitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<SplitResponse | null>(() => peekSplit(id));
  const [failed, setFailed] = useState(false);
  const [inDaftar, setInDaftar] = useState(() => (prefs.get("split_daftar") ?? "").split(",").includes(id));
  const [adding, setAdding] = useState(false);
  const load = useCallback(() => {
    getSplit(id)
      .then((r) => {
        setData(r);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [id]);
  useFocusEffect(load);

  if (!data) return <View style={styles.center}>{failed ? <EmptyState title={t.split.offline} /> : <ActivityIndicator color={palette.primary} />}</View>;
  const { split, share_text } = data;
  const resend = () => void Linking.openURL(whatsappShareUrl(share_text)).catch(() => Share.share({ message: share_text }));
  const togglePaid = (index: number, paid: boolean) =>
    void markSplitPaid(split.id, index, paid)
      .then(setData)
      .catch(() => notify(t.split.offline, "error"));
  const entries = daftarFromSplit(split, t.split.daftarNote);
  // Put what is still owed into the Daftar (once per split on this phone), so it stays tracked.
  const toDaftar = async () => {
    setAdding(true);
    try {
      for (const e of entries) await createDaftar(e);
      const done = (prefs.get("split_daftar") ?? "").split(",").filter(Boolean).slice(-50);
      prefs.set("split_daftar", [...done, split.id].join(","));
      setInDaftar(true);
      track("split_to_daftar", { entries: entries.length });
      notify(fill(t.split.inDaftar, { n: entries.length }));
    } catch {
      notify(t.split.offline, "error");
    } finally {
      setAdding(false);
    }
  };
  const owed = split.people.reduce((sum, p, i) => (i === split.paid_by || p.paid ? sum : sum + p.share), 0);

  return (
    <Screen refreshing={false} onRefresh={load} contentStyle={styles.content}>
      <Stack.Screen options={{ title: split.title || t.split.title }} />
      <Card style={styles.total}>
        <Text variant="small" color={palette.inkSoft}>
          {t.split.total}
        </Text>
        <Text variant="number">{fill(t.ui.pounds, { n: formatMoney(split.total) })}</Text>
        {split.paid_by !== null && owed > 0 ? (
          <Text variant="small" color={palette.ok}>
            {fill(t.split.stillOwed, { n: formatMoney(owed) })}
          </Text>
        ) : null}
        {split.web_adds > 0 ? <Badge label={fill(t.split.webAdds, { n: split.web_adds })} tone="primary" /> : null}
      </Card>
      {split.people.map((p, i) => {
        const payer = i === split.paid_by;
        return (
          <Card key={i}>
            <View style={styles.row}>
              <Icon name={payer ? "wallet" : p.paid ? "checkmark-circle" : "ellipse-outline"} size={20} color={payer || p.paid ? palette.ok : palette.inkFaint} />
              <View style={styles.flex}>
                <Text variant="bodyStrong">{p.name}</Text>
                {split.items.length ? (
                  <Text variant="caption" color={palette.inkSoft}>
                    {fill(t.split.orderedLine, { n: formatMoney(p.ordered) })}
                  </Text>
                ) : null}
              </View>
              <Text variant="bodyStrong">{formatMoney(p.share)}</Text>
            </View>
            {payer ? (
              <Text variant="caption" color={palette.ok}>
                {t.split.paidBill}
              </Text>
            ) : split.paid_by !== null ? (
              <Pressable onPress={() => togglePaid(i, !p.paid)} accessibilityRole="checkbox" accessibilityState={{ checked: p.paid }} style={styles.paid}>
                <Text variant="small" color={p.paid ? palette.ok : palette.primaryInk}>
                  {p.paid ? t.split.paidBack : t.split.markPaid}
                </Text>
              </Pressable>
            ) : null}
          </Card>
        );
      })}
      {split.items.length ? (
        <Card style={styles.items}>
          <Text variant="headline">{t.split.items}</Text>
          {split.items.map((it, i) => (
            <View key={i} style={styles.row}>
              <Text variant="small" style={styles.flex}>
                {it.name} · {it.eaters.length ? it.eaters.map((e) => split.people[e]?.name ?? "").join("، ") : t.split.everyone}
              </Text>
              <Text variant="small">{formatMoney(it.price)}</Text>
            </View>
          ))}
        </Card>
      ) : null}
      {entries.length && !inDaftar ? <Button label={t.split.toDaftar} kind="outline" icon="book-outline" block disabled={adding} onPress={() => void toDaftar()} /> : null}
      <Button label={t.split.resend} kind="whatsapp" icon="logo-whatsapp" block onPress={resend} />
      <Button label={t.split.shareCard} kind="outline" icon="image-outline" block onPress={() => void shareSplitCard(split.url).then((ok) => (ok ? track("split_card_shared") : notify(t.split.offline, "error")))} />
      <Button label={t.split.openPage} kind="outline" icon="open-outline" block onPress={() => void Linking.openURL(split.url)} />
      <Button
        label={t.split.delete}
        kind="text"
        onPress={() =>
          confirm(t.split.deleteConfirm, t.split.delete, () =>
            void deleteSplit(split.id)
              .then(() => router.back())
              .catch(() => notify(t.split.offline, "error")),
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: palette.bg, padding: space.xl },
  content: { padding: space.xl, gap: space.md },
  flex: { flex: 1 },
  total: { alignItems: "center", gap: space.xs },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  paid: { marginTop: space.xs, alignSelf: "flex-start" },
  items: { gap: space.sm },
});
