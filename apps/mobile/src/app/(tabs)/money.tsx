import { RefreshControl, ScrollView, StyleSheet, Text } from "react-native";
import { ItemRow, SectionTitle } from "@/components/ItemRow";
import { listDebts } from "@/db/items";
import { t } from "@/i18n";
import { summarizeDebts, type PersonTotal } from "@/lib/group";
import { colors } from "@/lib/theme";
import { useItems } from "@/lib/useItems";

const amount = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

/** FR-12: who owes what (PRD persona: the small trader, Hassan). */
export default function MoneyScreen() {
  const { items, refreshing, refresh, complete } = useItems(listDebts);
  const { owedToMe, iOwe } = summarizeDebts(items);

  const section = (title: string, people: PersonTotal[]) =>
    people.length
      ? [
          <SectionTitle key={title}>{title}</SectionTitle>,
          ...people.flatMap((p) =>
            p.items.map((i) => (
              <ItemRow
                key={i.id}
                title={`${p.person} · ${amount(i.debt_amount ?? 0)}`}
                meta={p.items.length > 1 && i === p.items[0] ? `Σ ${amount(p.total)}` : i.due_at ? new Date(i.due_at).toLocaleDateString() : undefined}
                action={t.money.paid}
                onAction={() => void complete(i.id).catch(() => {})}
              />
            )),
          ),
        ]
      : [];

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      {owedToMe.length + iOwe.length === 0 ? <Text style={styles.empty}>{t.money.empty}</Text> : null}
      {section(t.money.owedToMe, owedToMe)}
      {section(t.money.iOwe, iOwe)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 8 },
  empty: { color: colors.muted, textAlign: "center", marginTop: 40, fontSize: 15 },
});
