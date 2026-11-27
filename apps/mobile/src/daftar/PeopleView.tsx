import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { daftarTotals, type DaftarEntry, type Item, type PocketAccount } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { listDebts } from "@/db/items";
import { t } from "@/i18n";
import { getPocketMoney, listDaftar, peekDaftar, peekPocketMoney } from "@/lib/api";
import { failText } from "@/lib/errors";
import { summarizeDebts } from "@/lib/group";
import { useLive } from "@/lib/live";
import { useItems } from "@/lib/useItems";
import { Button, Card, IntroPanel, LoadingCards, NavRow, Note, palette, PersonAvatar, RowGroup, SectionHeader, space, Text, Tile, TileGrid } from "@/ui";
import { DaftarCard } from "./DaftarCard";
import { pocketRows } from "./layout";
import { formatMoney } from "./logic";

/**
 * The Daftar's People part: the balance on top, what both sides agreed on (shared, confirmed by
 * link), the user's private notes of who owes what (FR-12; they can be sent to confirm), pocket
 * money from homework (one row per child, or per parent for a child), then what was settled.
 */
export function PeopleView({ reloadKey }: { reloadKey: number }) {
  const { items, refresh, complete } = useItems(listDebts);
  const { owedToMe, iOwe } = summarizeDebts(items);
  const [shared, setShared] = useState<DaftarEntry[] | null>(() => peekDaftar());
  const [pocket, setPocket] = useState<PocketAccount[]>(() => peekPocketMoney() ?? []);
  const [offline, setOffline] = useState<string | null>(null);

  const loadShared = useCallback(async () => {
    const held = peekDaftar();
    if (held) setShared(held);
    const heldPocket = peekPocketMoney();
    if (heldPocket) setPocket(heldPocket);
    // Pocket money is a small extra here: with no answer the saved rows stay.
    void getPocketMoney()
      .then(setPocket)
      .catch(() => {});
    try {
      setShared(await listDaftar());
      setOffline(null);
    } catch (err) {
      setOffline(failText(err, t.daftar.offline));
    }
  }, []);
  useLive(loadShared);
  // Pull-to-refresh on the Daftar tab bumps reloadKey.
  const firstKey = useRef(reloadKey);
  useEffect(() => {
    if (reloadKey === firstKey.current) return;
    void refresh();
    void loadShared();
  }, [reloadKey, refresh, loadShared]);

  const share = (i: Item) =>
    router.push({ pathname: "/daftar/new", params: { name: i.debt_person ?? "", amount: String(i.debt_amount ?? ""), direction: i.debt_direction ?? "owed_to_me", itemId: i.id } });

  const open = (shared ?? []).filter((e) => e.status !== "settled");
  const settled = (shared ?? []).filter((e) => e.status === "settled").slice(0, 5);
  const totals = daftarTotals(shared ?? []);
  const privateNotes = [...owedToMe.map((p) => ({ p, mine: true })), ...iOwe.map((p) => ({ p, mine: false }))];
  const pocketList = pocketRows(pocket);
  const unit = fill(t.ui.pounds, { n: "" }).trim();
  const nothing = shared !== null && shared.length === 0 && privateNotes.length === 0 && pocketList.length === 0;

  if (nothing) return <IntroPanel title={t.lay.daftar.peopleEmpty} action={t.lay.common.add} onAction={() => router.push("/daftar/new")} say={t.lay.daftar.peopleSay} />;

  return (
    <>
      <TileGrid>
        <Tile title={t.ui.owedToYou} icon="arrow-down-circle-outline" value={formatMoney(totals.owedToMe)} line={unit} tone="ok" />
        <Tile title={t.ui.youOwe} icon="arrow-up-circle-outline" value={formatMoney(totals.iOwe)} line={unit} tone="primary" />
      </TileGrid>

      {shared === null ? offline ? <Note icon="cloud-offline-outline">{offline}</Note> : <LoadingCards count={2} tile={false} /> : null}
      {open.length ? <SectionHeader title={t.ui.shared} /> : null}
      {open.map((e) => (
        <DaftarCard key={e.id} entry={e} onChanged={() => void loadShared()} />
      ))}

      {privateNotes.length ? <SectionHeader title={t.ui.private} /> : null}
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

      {pocketList.length ? (
        <RowGroup title={t.homework.pocketTitle}>
          {pocketList.map((r, i) => (
            <NavRow
              key={r.key}
              first={i === 0}
              icon="wallet-outline"
              title={r.name ?? t.circles.noName}
              value={r.owed > 0 ? fill(r.role === "parent" ? t.lay.daftar.pocketYouOwe : t.lay.daftar.pocketOwedYou, { n: formatMoney(r.owed) }) : t.lay.daftar.pocketClear}
              onPress={() => router.push("/pocket")}
            />
          ))}
        </RowGroup>
      ) : null}

      {settled.length ? <SectionHeader title={t.ui.settled} /> : null}
      {settled.map((e) => (
        <DaftarCard key={e.id} entry={e} onChanged={() => void loadShared()} />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  noteHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  noteActions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.xs },
});
