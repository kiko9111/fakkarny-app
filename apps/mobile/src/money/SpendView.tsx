import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import type { MoneyOverview, MoneySection } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { formatMoney } from "@/daftar/logic";
import { dateLocale, t } from "@/i18n";
import { getMoney, getMonthGift } from "@/lib/api";
import { photosAvailable } from "@/lib/photos";
import { Badge, Button, Card, EmptyState, Icon, IconTile, Note, palette, ProgressBar, radius, SectionHeader, space, Text, ZakiAvatar } from "@/ui";
import { budgetState, groupSections, monthLabel } from "./logic";

/** Spending and income: this month's totals, Zaki's month gift early in the month, and the sections. */
export function SpendView({ reloadKey }: { reloadKey: number }) {
  const [data, setData] = useState<MoneyOverview | null>(null);
  const [gift, setGift] = useState<string[]>([]);
  const [offline, setOffline] = useState(false);

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
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load, reloadKey]),
  );

  if (!data) return offline ? <Note icon="cloud-offline-outline">{t.book.offline}</Note> : null;
  const { own, shared } = groupSections(data.sections);

  return (
    <>
      <Text variant="smallStrong" color={palette.inkSoft}>
        {monthLabel(data.month, dateLocale)}
      </Text>
      <View style={styles.totals}>
        <View style={[styles.total, { backgroundColor: palette.friendsSoft }]}>
          <View style={styles.totalHead}>
            <Icon name="arrow-up-circle" size={18} color={palette.friends} />
            <Text variant="smallStrong" color={palette.friends}>
              {t.book.spent}
            </Text>
          </View>
          <Text variant="number" color={palette.friends}>
            {formatMoney(data.totals.expense)}
          </Text>
        </View>
        <View style={[styles.total, { backgroundColor: palette.okSoft }]}>
          <View style={styles.totalHead}>
            <Icon name="arrow-down-circle" size={18} color={palette.ok} />
            <Text variant="smallStrong" color={palette.ok}>
              {t.book.income}
            </Text>
          </View>
          <Text variant="number" color={palette.ok}>
            {formatMoney(data.totals.income)}
          </Text>
        </View>
      </View>

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

      <Button label={t.book.newSection} icon="add" block onPress={() => router.push("/money/new")} />
      {photosAvailable ? <Button label={t.receipt.open} icon="camera-outline" kind="tonal" block onPress={() => router.push("/receipt")} /> : null}
      <Text variant="small" color={palette.inkSoft}>
        {t.book.chatHint}
      </Text>

      <SectionHeader title={t.book.sections} />
      {own.length === 0 ? (
        <Card>
          <EmptyState title={t.book.empty} />
        </Card>
      ) : null}
      {own.map((s) => (
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
  totals: { flexDirection: "row", gap: space.md },
  total: { flex: 1, borderRadius: radius.lg, padding: space.lg, gap: 2 },
  totalHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  giftHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
  flex: { flex: 1, minWidth: 0 },
});
