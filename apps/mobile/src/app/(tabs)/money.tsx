import { useCallback, useState } from "react";
import { useLive } from "@/lib/live";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { daftarTotals, type DaftarEntry, type Item } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { DaftarCard } from "@/daftar/DaftarCard";
import { formatMoney } from "@/daftar/logic";
import { listDebts } from "@/db/items";
import { t } from "@/i18n";
import { failText } from "@/lib/errors";
import { listDaftar, peekDaftar } from "@/lib/api";
import { summarizeDebts } from "@/lib/group";
import { useItems } from "@/lib/useItems";
import { SpendView } from "@/money/SpendView";
import { SplitsView } from "@/split/SplitsView";
import { Button, Card, Chip, EmptyState, Icon, Note, palette, PersonAvatar, radius, Screen, SectionHeader, space, Text } from "@/ui";

/**
 * The Daftar: what both sides agreed on (shared, confirmed by link) with the balance on top,
 * then the user's private notes of who owes what (FR-12), which can be sent to confirm.
 */
export default function MoneyScreen() {
  const [view, setView] = useState<"spend" | "debts" | "split">("spend");
  const [reloadKey, setReloadKey] = useState(0);
  const { items, refresh, complete } = useItems(listDebts);
  const { owedToMe, iOwe } = summarizeDebts(items);
  const [shared, setShared] = useState<DaftarEntry[] | null>(() => peekDaftar());
  const [offline, setOffline] = useState<string | null>(null);

  const loadShared = useCallback(async () => {
    const held = peekDaftar();
    if (held) setShared(held);
    try {
      setShared(await listDaftar());
      setOffline(null);
    } catch (err) {
      setOffline(failText(err, t.daftar.offline));
    }
  }, []);
  useLive(loadShared);

  const share = (i: Item) =>
    router.push({ pathname: "/daftar/new", params: { name: i.debt_person ?? "", amount: String(i.debt_amount ?? ""), direction: i.debt_direction ?? "owed_to_me", itemId: i.id } });

  const open = (shared ?? []).filter((e) => e.status !== "settled");
  const settled = (shared ?? []).filter((e) => e.status === "settled").slice(0, 5);
  const totals = daftarTotals(shared ?? []);
  const privateNotes = [...owedToMe.map((p) => ({ p, mine: true })), ...iOwe.map((p) => ({ p, mine: false }))];

  return (
    <Screen
      onRefresh={() => {
        setReloadKey((k) => k + 1);
        return Promise.all([refresh(), loadShared()]);
      }}
    >
      <View style={styles.switch}>
        <Chip icon="receipt-outline" label={t.book.tabSpend} selected={view === "spend"} onPress={() => setView("spend")} />
        <Chip icon="swap-horizontal-outline" label={t.book.tabDebts} selected={view === "debts"} onPress={() => setView("debts")} />
        <Chip icon="pie-chart-outline" label={t.split.tab} selected={view === "split"} onPress={() => setView("split")} />
      </View>
      {view === "spend" ? <SpendView reloadKey={reloadKey} /> : view === "split" ? <SplitsView reloadKey={reloadKey} /> : debts()}
    </Screen>
  );

  // A plain render helper (not a component), so the cards keep their state across renders.
  function debts() {
    return (
      <>
      <Text variant="small" color={palette.inkSoft}>
        {t.ui.moneyLine}
      </Text>
      <View style={styles.totals}>
        <View style={[styles.total, { backgroundColor: palette.okSoft }]}>
          <View style={styles.totalHead}>
            <Icon name="arrow-down-circle" size={18} color={palette.ok} />
            <Text variant="smallStrong" color={palette.ok}>
              {t.ui.owedToYou}
            </Text>
          </View>
          <Text variant="number" color={palette.ok}>
            {formatMoney(totals.owedToMe)}
          </Text>
          <Text variant="caption" color={palette.ok}>
            {fill(t.ui.pounds, { n: "" }).trim()}
          </Text>
        </View>
        <View style={[styles.total, { backgroundColor: palette.friendsSoft }]}>
          <View style={styles.totalHead}>
            <Icon name="arrow-up-circle" size={18} color={palette.friends} />
            <Text variant="smallStrong" color={palette.friends}>
              {t.ui.youOwe}
            </Text>
          </View>
          <Text variant="number" color={palette.friends}>
            {formatMoney(totals.iOwe)}
          </Text>
          <Text variant="caption" color={palette.friends}>
            {fill(t.ui.pounds, { n: "" }).trim()}
          </Text>
        </View>
      </View>
      <Button label={t.daftar.add.replace(/^\+\s*/, "")} icon="add" block onPress={() => router.push("/daftar/new")} />

      <SectionHeader title={t.ui.shared} />
      {offline && shared === null ? <Note icon="cloud-offline-outline">{offline}</Note> : null}
      {shared !== null && shared.length === 0 ? (
        <Card>
          <EmptyState title={t.daftar.empty} body={t.daftar.intro} />
        </Card>
      ) : null}
      {open.map((e) => (
        <DaftarCard key={e.id} entry={e} onChanged={() => void loadShared()} />
      ))}
      {settled.length ? <SectionHeader title={t.ui.settled} /> : null}
      {settled.map((e) => (
        <DaftarCard key={e.id} entry={e} onChanged={() => void loadShared()} />
      ))}

      {privateNotes.length ? (
        <>
          <SectionHeader title={t.ui.private} />
          <Text variant="small" color={palette.inkSoft}>
            {t.ui.privateHint}
          </Text>
        </>
      ) : null}
      {/* Laid out like the shared entries above: who and how much on one line, the actions under it. */}
      {privateNotes.flatMap(({ p, mine }) =>
        p.items.map((i) => (
          <Card key={i.id}>
            <View style={styles.noteHead}>
              <PersonAvatar name={p.person} color={mine ? palette.ok : palette.primaryInk} bg={mine ? palette.okSoft : palette.primarySoft} />
              <View style={styles.flex}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {p.person}
                </Text>
                <Text variant="small" color={palette.inkSoft} numberOfLines={1}>
                  {mine ? t.ui.owedToYou : t.ui.youOwe}
                </Text>
              </View>
              <Text variant="headline" color={mine ? palette.ok : palette.primaryInk}>
                {mine ? "+" : "−"}
                {fill(t.ui.pounds, { n: formatMoney(i.debt_amount ?? 0) })}
              </Text>
            </View>
            <View style={styles.noteActions}>
              <Button label={t.money.sendToConfirm} size="sm" kind="tonal" icon="logo-whatsapp" onPress={() => share(i)} />
              <Button label={t.money.paid} size="sm" kind="outline" icon="checkmark-done" onPress={() => void complete(i.id).catch(() => {})} />
            </View>
          </Card>
        )),
      )}
      </>
    );
  }
}

const styles = StyleSheet.create({
  switch: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  totals: { flexDirection: "row", gap: space.md },
  total: { flex: 1, borderRadius: radius.lg, padding: space.lg, gap: 2 },
  totalHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  flex: { flex: 1, minWidth: 0 },
  noteHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  noteActions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.xs },
});
