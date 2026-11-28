import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { daftarTotals, type DaftarEntry, type Gameya, type Item, type PocketAccount, type Split } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { listDebts } from "@/db/items";
import { dateLocale, t } from "@/i18n";
import { getPocketMoney, listDaftar, listGameyas, peekDaftar, peekGameyas, peekPocketMoney, peekSplits } from "@/lib/api";
import { gameyaLine } from "@/gameya/logic";
import { failText } from "@/lib/errors";
import { summarizeDebts } from "@/lib/group";
import { useLive } from "@/lib/live";
import { useItems } from "@/lib/useItems";
import { Button, Icon, IntroPanel, LoadingCards, NavRow, Note, palette, PersonAvatar, RowGroup, Rows, SectionHeader, space, StatStrip, Text } from "@/ui";
import { DaftarCard } from "./DaftarCard";
import { peopleTotals, pocketRows } from "./layout";
import { formatMoney } from "./logic";

/**
 * The Daftar's People part: three amounts on top (owed to you, you owe, due this month; the
 * private notes are counted), then what has a date (gam'eyas, pocket money), then what both sides
 * agreed on (shared, confirmed by link) and the user's private notes of who owes what (FR-12; they
 * can be sent to confirm) as rows whose actions fold under them, then what was settled.
 */
export function PeopleView({ reloadKey }: { reloadKey: number }) {
  const { items, refresh, complete } = useItems(listDebts);
  const { owedToMe, iOwe } = summarizeDebts(items);
  const [shared, setShared] = useState<DaftarEntry[] | null>(() => peekDaftar());
  const [pocket, setPocket] = useState<PocketAccount[]>(() => peekPocketMoney() ?? []);
  const [gameyas, setGameyas] = useState<Gameya[]>(() => peekGameyas() ?? []);
  const [offline, setOffline] = useState<string | null>(null);
  const [splits, setSplits] = useState<Split[]>(() => peekSplits() ?? []);
  /** The private note whose actions are open. */
  const [openNote, setOpenNote] = useState<string | null>(null);

  const loadShared = useCallback(async () => {
    const held = peekDaftar();
    if (held) setShared(held);
    const heldSplits = peekSplits();
    if (heldSplits) setSplits(heldSplits);
    const heldPocket = peekPocketMoney();
    if (heldPocket) setPocket(heldPocket);
    // Pocket money is a small extra here: with no answer the saved rows stay.
    void getPocketMoney()
      .then(setPocket)
      .catch(() => {});
    void listGameyas()
      .then(setGameyas)
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
  const sum = (rows: { total: number }[]) => rows.reduce((n, r) => n + r.total, 0);
  const totals = peopleTotals({ shared: daftarTotals(shared ?? []), notesOwedToMe: sum(owedToMe), notesIOwe: sum(iOwe), gameyas, splits });
  const money = (n: number) => fill(t.ui.pounds, { n: formatMoney(n) });
  const privateNotes = [...owedToMe.map((p) => ({ p, mine: true })), ...iOwe.map((p) => ({ p, mine: false }))];
  const pocketList = pocketRows(pocket);
  const nothing = shared !== null && shared.length === 0 && privateNotes.length === 0 && pocketList.length === 0 && gameyas.length === 0;

  if (nothing) return <IntroPanel title={t.lay.daftar.peopleEmpty} action={t.lay.common.add} onAction={() => router.push("/daftar/new")} say={t.lay.daftar.peopleSay} />;

  return (
    <>
      <StatStrip
        cells={[
          { key: "owed", value: money(totals.owedToMe), label: t.ui.owedToYou, tone: totals.owedToMe > 0 ? "ok" : undefined },
          { key: "owe", value: money(totals.iOwe), label: t.ui.youOwe },
          ...(totals.due > 0 ? [{ key: "due", value: money(totals.due), label: t.lay.daftar.dueMonth, tone: "warn" as const }] : []),
        ]}
      />

      {gameyas.length ? (
        <RowGroup title={t.lay.gameya.group}>
          {gameyas.map((g, i) => (
            <NavRow key={g.id} first={i === 0} icon="sync-circle-outline" kind="money" title={g.name} value={gameyaLine(g, t.lay.gameya, dateLocale)} onPress={() => router.push({ pathname: "/gameya/[id]", params: { id: g.id } })} />
          ))}
        </RowGroup>
      ) : null}

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

      {shared === null ? offline ? <Note icon="cloud-offline-outline">{offline}</Note> : <LoadingCards count={2} tile={false} /> : null}
      {open.length ? <SectionHeader title={t.ui.shared} /> : null}
      <Rows>
        {open.map((e) => (
          <DaftarCard key={e.id} entry={e} onChanged={() => void loadShared()} flat />
        ))}
      </Rows>

      {privateNotes.length ? <SectionHeader title={t.ui.private} /> : null}
      {/* Laid out like the shared entries above: who and how much on one line, the actions folded under it. */}
      <Rows>
        {privateNotes.flatMap(({ p, mine }) =>
          p.items.map((i) => (
            <View key={i.id} style={styles.note}>
              <Pressable
                onPress={() => setOpenNote((id) => (id === i.id ? null : i.id))}
                accessibilityRole="button"
                accessibilityState={{ expanded: openNote === i.id }}
                accessibilityLabel={`${p.person}, ${mine ? t.ui.owedToYou : t.ui.youOwe} ${money(i.debt_amount ?? 0)}`}
                style={styles.noteHead}
              >
                <PersonAvatar name={p.person} size={36} color={mine ? palette.ok : palette.primaryInk} bg={mine ? palette.okSoft : palette.primarySoft} />
                <View style={styles.flex}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {p.person}
                  </Text>
                  <Text variant="small" color={palette.inkSoft} numberOfLines={1}>
                    {mine ? t.ui.owedToYou : t.ui.youOwe}
                  </Text>
                </View>
                <Text variant="bodyStrong" color={mine ? palette.ok : palette.primaryInk}>
                  {mine ? "+" : "−"}
                  {money(i.debt_amount ?? 0)}
                </Text>
                <Icon name={openNote === i.id ? "chevron-up" : "chevron-down"} size={16} color={palette.inkFaint} />
              </Pressable>
              {openNote === i.id ? (
                <View style={styles.noteActions}>
                  <Button label={t.money.sendToConfirm} size="sm" kind="tonal" icon="logo-whatsapp" onPress={() => share(i)} />
                  <Button label={t.money.paid} size="sm" kind="outline" icon="checkmark-done" onPress={() => void complete(i.id).catch(() => {})} />
                </View>
              ) : null}
            </View>
          )),
        )}
      </Rows>

      {settled.length ? <SectionHeader title={t.ui.settled} /> : null}
      <Rows>
        {settled.map((e) => (
          <DaftarCard key={e.id} entry={e} onChanged={() => void loadShared()} flat />
        ))}
      </Rows>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  note: { paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.xs },
  noteHead: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 48 },
  noteActions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
