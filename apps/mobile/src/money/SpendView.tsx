import { useCallback, useEffect, useRef, useState } from "react";
import { dataChanged, useLive } from "@/lib/live";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import type { MoneyOverview, MoneySection } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { formatMoney } from "@/daftar/logic";
import { dateLocale, t } from "@/i18n";
import { getMoney, getMonthGift, peekMoney } from "@/lib/api";
import { Pressable } from "react-native";
import { Badge, Card, Icon, IconTile, IntroPanel, LoadingCards, Note, palette, ProgressBar, Rows, SectionHeader, space, StatStrip, Text, ZakiAvatar } from "@/ui";
import { budgetState, groupSections, monthLabel } from "./logic";

/**
 * The Daftar's Spending part: this month's amounts in one strip (spent, income, and what is left
 * of the budgets when any section has one), Zaki's month gift early in the month, her
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
  const money = (n: number) => fill(t.ui.pounds, { n: formatMoney(n) });
  // What is left of this month's budgets: only the sections that have one count on either side.
  const withBudget = spending.filter((s) => (s.budget ?? 0) > 0);
  const budget = withBudget.reduce((n, s) => n + (s.budget ?? 0), 0);
  const budgeted = withBudget.reduce((n, s) => n + s.month_total, 0);

  return (
    <>
      <Text variant="smallStrong" color={palette.inkSoft}>
        {monthLabel(data.month, dateLocale)}
      </Text>
      <StatStrip
        cells={[
          { key: "spent", value: money(data.totals.expense), label: t.book.spent },
          { key: "income", value: money(data.totals.income), label: t.book.income, tone: data.totals.income > 0 ? "ok" : undefined },
          ...(budget > 0 ? [{ key: "left", value: money(Math.max(0, budget - budgeted)), label: t.lay.daftar.left, tone: budgeted > budget ? ("danger" as const) : undefined }] : []),
        ]}
      />

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
      <Rows>
        {spending.map((s) => (
          <SectionRow key={s.id} s={s} />
        ))}
      </Rows>
      {income.length ? <SectionHeader title={t.book.incomeHeader} /> : null}
      <Rows>
        {income.map((s) => (
          <SectionRow key={s.id} s={s} />
        ))}
      </Rows>
      {shared.length ? <SectionHeader title={t.book.shared} /> : null}
      <Rows>
        {shared.map((s) => (
          <SectionRow key={s.id} s={s} />
        ))}
      </Rows>
    </>
  );
}

/** One section as a row of the list: what it is, this month's amount, its budget bar under it. */
function SectionRow({ s }: { s: MoneySection }) {
  const b = budgetState(s);
  const income = s.kind === "income";
  return (
    <Pressable onPress={() => router.push({ pathname: "/money/[id]", params: { id: s.id } })} accessibilityRole="button" accessibilityLabel={s.name} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.head}>
        <IconTile name={s.circle_id ? "people-outline" : income ? "cash-outline" : "wallet-outline"} kind={income ? "people" : "money"} size={36} />
        <View style={styles.flex}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {s.name}
          </Text>
          <Text variant="small" color={b?.over ? palette.danger : palette.inkSoft} numberOfLines={1}>
            {[s.circle_name, b ? fill(t.book.ofBudget, { n: formatMoney(s.month_total), budget: formatMoney(s.budget ?? 0) }) : formatMoney(s.month_total)].filter(Boolean).join(" · ")}
          </Text>
        </View>
        {s.circle_id ? <Badge label={fill(t.book.yourShare, { n: formatMoney(s.my_share) })} tone="primary" /> : null}
        <Icon name="chevron-forward" size={18} color={palette.inkFaint} />
      </View>
      {b ? <ProgressBar value={b.value} color={b.over ? palette.danger : b.near ? palette.warn : palette.ok} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  giftHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  row: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.sm, minHeight: 60, justifyContent: "center" },
  pressed: { backgroundColor: palette.wash },
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
  flex: { flex: 1, minWidth: 0 },
});
