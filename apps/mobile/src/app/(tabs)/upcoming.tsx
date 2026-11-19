import { RefreshControl, ScrollView, StyleSheet, Text } from "react-native";
import { ItemRow, SectionTitle } from "@/components/ItemRow";
import { listUpcoming } from "@/db/items";
import { t } from "@/i18n";
import { groupUpcoming } from "@/lib/group";
import { colors } from "@/lib/theme";
import { useItems } from "@/lib/useItems";

const when = (iso: string) =>
  new Date(iso).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });

/** FR-12 / F8: for users who want to look. The friend never sends this as a list unprompted. */
export default function UpcomingScreen() {
  const { items, refreshing, refresh, complete } = useItems(listUpcoming);
  const groups = groupUpcoming(items, new Date());

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      {groups.length === 0 ? <Text style={styles.empty}>{t.upcoming.empty}</Text> : null}
      {groups.map((g) => [
        <SectionTitle key={g.bucket}>{t.upcoming[g.bucket]}</SectionTitle>,
        ...g.items.map((i) => (
          <ItemRow
            key={i.id}
            title={`${i.important ? "❗ " : ""}${i.title}`}
            meta={i.due_at ? when(i.due_at) : undefined}
            action={t.upcoming.done}
            onAction={() => void complete(i.id).catch(() => {})}
          />
        )),
      ])}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 8 },
  empty: { color: colors.muted, textAlign: "center", marginTop: 40, fontSize: 15 },
});
