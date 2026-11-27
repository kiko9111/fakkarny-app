import { useCallback, useEffect, useRef, useState } from "react";
import { dataChanged, useLive } from "@/lib/live";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import type { MoneyOverview, MoneySection } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { formatMoney } from "@/daftar/logic";
import { dateLocale, t } from "@/i18n";
import { getMoney, getMonthGift, peekMoney } from "@/lib/api";
import { Badge, Card, IconTile, IntroPanel, LoadingCards, Note, palette, ProgressBar, SectionHeader, space, Text, Tile, TileGrid, ZakiAvatar } from "@/ui";
import { budgetState, groupSections, monthLabel } from "./logic";

/**
 * The Daftar's Spending part: this month's two totals, Zaki's month gift early in the month, her
 * sections, then the shared books. Adding starts from the tab's "+" (money.tsx).
 */
export function SpendView({ reloadKey }: { reloadKey: number }) {
  const [data, setData] = useState<MoneyOverview | null>(() => peekMoney());
  const [gift, setGift] = useState<string[]>([]);
  const [offline, setOffline] = useState(false);
  // A change made on this phone (a section, an amount, Zaki in the chat): redraw from the saved copy at once.
  useEffect(() => dataChanged.subscribe(() => setData((d) => peekMoney() ?? d)), []);

  const load = useCallback(async () => {
    try {
      setData(await getMoney());
      setOffline(false);
      // The gift stays on top for the first week of the month.
      if (new Date().getDate() <= 7) setGift((await getMonthGift().catch(() => null))?.lines ?? []);
    } catch {
      setOffline(true);
    }
  }, []);
  useLive(load);
  // Pull-to-refresh on the Daftar tab bumps reloadKey.
  const firstKey = useRef(reloadKey);
  useEffect(() => {
    if (reloadKey !== firstKey.current) void load();
  }, [reloadKey, load]);

  if (!data) return offline ? <Note icon="cloud-offline-outline">{t.book.offline}</Note> : <LoadingCards />;
  const { own, shared } = groupSections(data.sections);
  const spending = own.filter((s) => s.kind === "expense");
  const income = own.filter((s) => s.kind === "income");

  return (
    <>
      <Text variant="smallStrong" color={palette.inkSoft}>
        {monthLabel(data.month, dateLocale)}
      </Text>
      <TileGrid>
        <Tile title={t.book.spent} icon="arrow-up-circle-outline" value={formatMoney(data.totals.expense)} />
        <Tile title={t.book.income} icon="arrow-down-circle-outline" value={formatMoney(data.totals.income)} />
      </TileGrid>

      {gift.length ? (
        <Card>
          <View style={styles.giftHead}>
            <ZakiAvatar size={32} />
            <Text variant="headline">{t.book.giftTitle}</Text>
          </View>
          {gift.slice(1).map((line) => (
            <Text key={line} variant="body">
              {line}
            </Text>
          ))}
        </Card>
      ) : null}

      {offline ? <Note icon="cloud-offline-outline">{t.book.stale}</Note> : null}
      {data.sections.length === 0 ? <IntroPanel title={t.lay.daftar.spendEmpty} action={t.lay.daftar.addSection} onAction={() => router.push("/money/new")} say={t.lay.daftar.spendSay} /> : null}
      {spending.length ? <SectionHeader title={t.book.spendHeader} /> : null}
      {spending.map((s) => (
        <SectionRow key={s.id} s={s} />
      ))}
      {income.length ? <SectionHeader title={t.book.incomeHeader} /> : null}
      {income.map((s) => (
        <SectionRow key={s.id} s={s} />
      ))}
      {shared.length ? <SectionHeader title={t.book.shared} /> : null}
      {shared.map((s) => (
        <SectionRow key={s.id} s={s} />
      ))}
    </>
  );
}

function SectionRow({ s }: { s: MoneySection }) {
  const b = budgetState(s);
  const income = s.kind === "income";
  return (
    <Card onPress={() => router.push({ pathname: "/money/[id]", params: { id: s.id } })} accessibilityLabel={s.name}>
      <View style={styles.head}>
        <IconTile name={s.circle_id ? "people" : income ? "wallet" : "receipt"} color={income ? palette.ok : palette.primaryInk} bg={income ? palette.okSoft : palette.primarySoft} />
        <View style={styles.flex}>
          <Text variant="headline">{s.name}</Text>
          <Text variant="small" color={palette.inkSoft}>
            {[s.circle_name, b ? fill(t.book.ofBudget, { n: formatMoney(s.month_total), budget: formatMoney(s.budget ?? 0) }) : formatMoney(s.month_total)].filter(Boolean).join(" · ")}
          </Text>
        </View>
        {b?.over ? <Badge label={t.book.overBudget} tone="danger" /> : null}
        {s.circle_id ? <Badge label={fill(t.book.yourShare, { n: formatMoney(s.my_share) })} tone="primary" /> : null}
      </View>
      {b ? <ProgressBar value={b.value} color={b.over ? palette.danger : b.near ? palette.warn : palette.ok} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  giftHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
  flex: { flex: 1, minWidth: 0 },
});
