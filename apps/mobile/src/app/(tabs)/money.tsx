import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import type { DaftarEntry, Item } from "@fakkarni/shared";
import { ItemRow, SectionTitle } from "@/components/ItemRow";
import { DaftarCard } from "@/daftar/DaftarCard";
import { listDebts } from "@/db/items";
import { t } from "@/i18n";
import { listDaftar } from "@/lib/api";
import { summarizeDebts, type PersonTotal } from "@/lib/group";
import { colors } from "@/lib/theme";
import { useItems } from "@/lib/useItems";

const amount = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

/**
 * Money: the shared Daftar (entries both people see, confirmed by link) on top, then the
 * user's private notes of who owes what (FR-12), which can be sent to the other person.
 */
export default function MoneyScreen() {
  const { items, refreshing, refresh, complete } = useItems(listDebts);
  const { owedToMe, iOwe } = summarizeDebts(items);
  const [shared, setShared] = useState<DaftarEntry[] | null>(null);
  const [offline, setOffline] = useState(false);

  const loadShared = useCallback(async () => {
    try {
      setShared(await listDaftar());
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadShared();
    }, [loadShared]),
  );

  const share = (i: Item) =>
    router.push({ pathname: "/daftar/new", params: { name: i.debt_person ?? "", amount: String(i.debt_amount ?? ""), direction: i.debt_direction ?? "owed_to_me", itemId: i.id } });

  const section = (title: string, people: PersonTotal[]) =>
    people.length
      ? [
          <SectionTitle key={title}>{title}</SectionTitle>,
          ...people.flatMap((p) =>
            p.items.map((i) => (
              <View key={i.id} style={styles.gap}>
                <ItemRow
                  title={`${p.person} · ${amount(i.debt_amount ?? 0)}`}
                  meta={p.items.length > 1 && i === p.items[0] ? `Σ ${amount(p.total)}` : i.due_at ? new Date(i.due_at).toLocaleDateString() : undefined}
                  action={t.money.paid}
                  onAction={() => void complete(i.id).catch(() => {})}
                />
                <Pressable onPress={() => share(i)} accessibilityRole="button">
                  <Text style={styles.link}>{t.money.sendToConfirm}</Text>
                </Pressable>
              </View>
            )),
          ),
        ]
      : [];

  const open = (shared ?? []).filter((e) => e.status !== "settled");
  const settled = (shared ?? []).filter((e) => e.status === "settled").slice(0, 5);
  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            void refresh();
            void loadShared();
          }}
        />
      }
    >
      <SectionTitle>{t.daftar.title}</SectionTitle>
      <Text style={styles.intro}>{t.daftar.intro}</Text>
      <Pressable style={({ pressed }) => [styles.add, pressed && styles.pressed]} onPress={() => router.push("/daftar/new")} accessibilityRole="button">
        <Text style={styles.addText}>{t.daftar.add}</Text>
      </Pressable>
      {offline && shared === null ? <Text style={styles.empty}>{t.daftar.offline}</Text> : null}
      {shared !== null && shared.length === 0 ? <Text style={styles.empty}>{t.daftar.empty}</Text> : null}
      {[...open, ...settled].map((e) => (
        <DaftarCard key={e.id} entry={e} onChanged={() => void loadShared()} />
      ))}

      {owedToMe.length + iOwe.length > 0 ? <SectionTitle>{t.money.privateTitle}</SectionTitle> : null}
      {section(t.money.owedToMe, owedToMe)}
      {section(t.money.iOwe, iOwe)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 8 },
  gap: { gap: 4 },
  intro: { color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: "left" },
  empty: { color: colors.muted, textAlign: "center", marginVertical: 16, fontSize: 15 },
  add: { borderWidth: 1, borderColor: colors.accent, borderStyle: "dashed", borderRadius: 14, paddingVertical: 12, alignItems: "center" },
  addText: { color: colors.accent, fontWeight: "600", fontSize: 15 },
  pressed: { opacity: 0.6 },
  link: { color: colors.accent, fontWeight: "600", fontSize: 13, textAlign: "left", paddingHorizontal: 14, paddingBottom: 4 },
});
