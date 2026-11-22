import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import type { SectionDetail } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { formatMoney, parseAmount } from "@/daftar/logic";
import { dateLocale, t } from "@/i18n";
import { addMoney, deleteMoneyEntry, deleteSection, getSection } from "@/lib/api";
import { budgetState, monthLabel, toggleSplit } from "@/money/logic";
import { Badge, Button, Card, Chip, confirm, IconButton, Note, notify, palette, ProgressBar, Screen, SectionHeader, space, Text, TextField } from "@/ui";

const day = (iso: string) => new Date(iso).toLocaleDateString(dateLocale, { weekday: "short", day: "numeric", month: "short" });

/** One section: this month's total against its budget, quick adding, entries, and for a shared book, who pays whom. */
export default function SectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<SectionDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [amountText, setAmountText] = useState("");
  const [note, setNote] = useState("");
  const [split, setSplit] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await getSection(id);
      setData(d);
      setSplit((s) => s ?? (d.members.length ? d.members.map((m) => m.user_id) : null));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [id]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const amount = parseAmount(amountText);
  const add = async () => {
    if (amount === null || busy) return;
    setBusy(true);
    try {
      await addMoney(id, { amount, note: note.trim() || null, ...(split && data?.section.circle_id ? { split } : {}) });
      setAmountText("");
      setNote("");
      notify(t.book.logged);
      await load();
    } catch {
      notify(t.book.failed, "error");
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "" }} />
        {failed ? <Note icon="cloud-offline-outline">{t.book.offline}</Note> : <ActivityIndicator color={palette.primary} />}
      </Screen>
    );
  }

  const s = data.section;
  const b = budgetState(s);
  const shared = Boolean(s.circle_id);
  const remove = () =>
    confirm(t.book.deleteConfirm, t.book.yes, () =>
      void deleteSection(id)
        .then(() => router.back())
        .catch(() => notify(t.book.failed, "error")),
      t.book.no,
    );

  return (
    <Screen keyboard>
      <Stack.Screen options={{ title: s.name, headerRight: s.is_owner ? () => <IconButton name="trash-outline" label={t.book.deleteSection} color={palette.danger} onPress={remove} /> : undefined }} />
      <Card>
        <Text variant="smallStrong" color={palette.inkSoft}>
          {[monthLabel(new Date().toISOString().slice(0, 7), dateLocale), s.circle_name].filter(Boolean).join(" · ")}
        </Text>
        <Text variant="number" color={b?.over ? palette.danger : palette.ink}>
          {formatMoney(s.month_total)}
        </Text>
        {b ? (
          <>
            <ProgressBar value={b.value} color={b.over ? palette.danger : b.near ? palette.warn : palette.ok} />
            <Text variant="small" color={palette.inkSoft}>
              {b.over ? t.book.overBudget : fill(t.book.ofBudget, { n: formatMoney(s.month_total), budget: formatMoney(s.budget ?? 0) })}
            </Text>
          </>
        ) : null}
        {shared ? <Badge label={fill(t.book.yourShare, { n: formatMoney(s.my_share) })} tone="primary" /> : null}
      </Card>

      <SectionHeader title={t.book.add} />
      <Card>
        <View style={styles.row}>
          <View style={styles.flex}>
            <TextField value={amountText} onChangeText={setAmountText} placeholder={t.book.amount} keyboardType="decimal-pad" maxLength={12} />
          </View>
          <Button label={t.book.log} icon="add" busy={busy} disabled={amount === null} onPress={() => void add()} />
        </View>
        <TextField value={note} onChangeText={setNote} placeholder={t.book.note} maxLength={80} />
        {shared && data.members.length > 1 && split ? (
          <>
            <Text variant="smallStrong" color={palette.inkSoft}>
              {t.book.splitAmong}
            </Text>
            <View style={styles.chips}>
              {data.members.map((m) => (
                <Chip key={m.user_id} icon="person-outline" label={m.is_me ? t.book.you : m.name ?? "?"} selected={split.includes(m.user_id)} onPress={() => setSplit(toggleSplit(split, m.user_id))} />
              ))}
            </View>
          </>
        ) : null}
      </Card>

      {shared ? (
        <>
          <SectionHeader title={t.book.settle} />
          <Card>
            {data.settle.length === 0 ? (
              <Text variant="small" color={palette.inkSoft} align="center">
                {t.book.allSquare}
              </Text>
            ) : (
              data.settle.map((x, n) => (
                <Text key={n} variant={x.from_me || x.to_me ? "bodyStrong" : "body"}>
                  {fill(t.book.settleLine, { from: x.from_me ? t.book.you : x.from_name ?? "?", to: x.to_me ? t.book.you : x.to_name ?? "?", n: formatMoney(x.amount) })}
                </Text>
              ))
            )}
          </Card>
        </>
      ) : null}

      <SectionHeader title={t.book.entries} />
      {data.entries.length === 0 ? (
        <Text variant="small" color={palette.inkSoft} align="center">
          {t.book.noEntries}
        </Text>
      ) : (
        <Card style={styles.list}>
          {data.entries.map((e, n) => (
            <View key={e.id} style={[styles.entry, n > 0 && styles.line]}>
              <View style={styles.flex}>
                <Text variant="bodyStrong">{formatMoney(e.amount)}</Text>
                <Text variant="small" color={palette.inkSoft}>
                  {[e.note, day(e.at), shared ? fill(t.book.by, { name: e.is_mine ? t.book.you : e.payer_name ?? "?" }) : null].filter(Boolean).join(" · ")}
                </Text>
              </View>
              {e.is_mine ? (
                <IconButton
                  name="close"
                  label={t.book.remove}
                  size={32}
                  onPress={() => confirm(t.book.removeConfirm, t.book.yes, () => void deleteMoneyEntry(e.id).then(load).catch(() => notify(t.book.failed, "error")), t.book.no)}
                />
              ) : null}
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  list: { gap: 0, paddingVertical: space.xs },
  entry: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(0,0,0,0.08)" },
});
