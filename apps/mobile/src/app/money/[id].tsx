import { useCallback, useEffect, useState } from "react";
import { dataChanged, useLive } from "@/lib/live";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import type { SectionDetail } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { formatMoney, parseAmount } from "@/daftar/logic";
import { dateLocale, t } from "@/i18n";
import { deleteSection, forgetSection, getSection, peekMoney, peekMoneySaved, peekSection, peekSectionSaved, saveMoney, saveSection, updateSection } from "@/lib/api";
import { findMovedSection, logAmount, realSectionId, removeAmount } from "@/money/actions";
import { budgetState, detailFromSection, monthLabel, toggleSplit, withoutSection, withSection } from "@/money/logic";
import { HttpError } from "@/sync/queue";
import { Badge, Button, Card, Chip, confirm, IconButton, Note, notify, palette, ProgressBar, Screen, SectionHeader, space, Text, TextField } from "@/ui";

/** The row the Daftar list already has for this section, shown while its entries load. */
const fromList = (id: string): SectionDetail | null => {
  const s = peekMoney()?.sections.find((x) => x.id === id);
  return s ? detailFromSection(s) : null;
};

const day = (iso: string) => new Date(iso).toLocaleDateString(dateLocale, { weekday: "short", day: "numeric", month: "short" });

/** One section: this month's total against its budget, quick adding, entries, and for a shared book, who pays whom. */
export default function SectionScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  // The server's id once it has answered (an older server picks its own for a section made here).
  const [id, setId] = useState(() => realSectionId(params.id));
  // Draws at once: the saved copy of this screen, else the row the Daftar list already has.
  const first = () => peekSection(id) ?? fromList(id);
  const [data, setData] = useState<SectionDetail | null>(first);
  const [fresh, setFresh] = useState(false);
  const [state, setState] = useState<"ok" | "failed" | "gone">("ok");
  const [amountText, setAmountText] = useState("");
  const [note, setNote] = useState("");
  const [split, setSplit] = useState<string[] | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budgetText, setBudgetText] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await getSection(id);
      setData(d);
      setSplit((s) => s ?? (d.members.length ? d.members.map((m) => m.user_id) : null));
      setFresh(true);
      setState("ok");
    } catch (err) {
      // A section made on this phone that the server hasn't got yet is not "gone".
      const missing = err instanceof HttpError && err.status === 404;
      // A twin merged into the older section of the same name: open that one instead.
      const moved = missing ? await findMovedSection(id) : null;
      if (moved) {
        setId(moved);
        setData((d) => peekSection(moved) ?? d);
        return;
      }
      if (missing && realSectionId(params.id) === id && !peekMoney()?.sections.some((x) => x.id === id)) setState("gone");
      else setState("failed");
      setData((d) => d ?? first());
    }
  }, [id, params.id]);
  useLive(load);
  // A change made here or by Zaki in the chat: redraw from the phone's copy at once, then refresh.
  useEffect(
    () =>
      dataChanged.subscribe(() => {
        const real = realSectionId(params.id);
        if (real !== id) {
          setId(real);
          setState("ok");
        }
        setData((d) => peekSection(real) ?? d);
      }),
    [id, params.id],
  );

  const amount = parseAmount(amountText);
  const add = () => {
    if (amount === null || !data) return;
    logAmount(id, { amount, note: note.trim() || null, split: data.section.circle_id ? split : null }, { onFailed: () => notify(t.book.failed, "error"), onQueued: () => notify(t.book.waiting) });
    setAmountText("");
    setNote("");
    setData(peekSection(id) ?? data);
    notify(t.book.logged);
  };

  if (state === "gone") {
    return (
      <Screen>
        <Stack.Screen options={{ title: "" }} />
        <Note icon="alert-circle-outline">{t.book.gone}</Note>
        <Button label={t.book.back} kind="tonal" onPress={() => router.back()} />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen onRefresh={load}>
        <Stack.Screen options={{ title: "" }} />
        {state === "failed" ? (
          <>
            <Note icon="cloud-offline-outline">{t.book.offline}</Note>
            <Button label={t.book.retry} kind="tonal" onPress={() => void load()} />
          </>
        ) : (
          <ActivityIndicator color={palette.primary} />
        )}
      </Screen>
    );
  }

  const s = data.section;
  const b = budgetState(s);
  const shared = Boolean(s.circle_id);
  const remove = () =>
    confirm(t.book.deleteConfirm, t.book.yes, () =>
      void deleteSection(id)
        .then(() => {
          const o = peekMoneySaved();
          if (o) saveMoney(withoutSection(o, id));
          forgetSection(id);
          dataChanged.emit();
          router.back();
        })
        .catch(() => notify(t.book.failed, "error")),
      t.book.no,
    );
  const newBudget = budgetText.trim() === "" ? null : parseAmount(budgetText);
  const saveBudget = () => {
    if (budgetText.trim() !== "" && newBudget === null) return;
    setBudgetOpen(false);
    void updateSection(id, { budget: newBudget })
      .then((sec) => {
        const d = peekSectionSaved(id);
        if (d) saveSection({ ...d, section: sec });
        const o = peekMoneySaved();
        if (o) saveMoney(withSection(o, sec));
        setData((cur) => (cur ? { ...cur, section: sec } : cur));
        dataChanged.emit();
        notify(t.book.budgetSaved);
      })
      .catch(() => notify(t.book.failed, "error"));
  };

  return (
    <Screen keyboard onRefresh={load}>
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
        {s.kind === "expense" && s.is_owner ? (
          budgetOpen ? (
            <View style={styles.row}>
              <View style={styles.flex}>
                <TextField value={budgetText} onChangeText={setBudgetText} placeholder={t.book.noBudgetHint} keyboardType="decimal-pad" maxLength={12} />
              </View>
              <Button label={t.book.saveBudget} size="sm" disabled={budgetText.trim() !== "" && newBudget === null} onPress={saveBudget} />
            </View>
          ) : (
            <Button
              label={s.budget ? t.book.editBudget : t.book.setBudget}
              kind="text"
              size="sm"
              icon="create-outline"
              onPress={() => {
                setBudgetText(s.budget ? String(s.budget) : "");
                setBudgetOpen(true);
              }}
            />
          )
        ) : null}
      </Card>
      {state === "failed" ? <Note icon="cloud-offline-outline">{t.book.stale}</Note> : null}

      <SectionHeader title={t.book.add} />
      <Card>
        <View style={styles.row}>
          <View style={styles.flex}>
            <TextField value={amountText} onChangeText={setAmountText} placeholder={t.book.amount} keyboardType="decimal-pad" maxLength={12} />
          </View>
          <Button label={t.book.log} icon="add" disabled={amount === null} onPress={add} />
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
          {fresh || state === "failed" || s.month_total === 0 ? t.book.noEntries : t.book.loadingEntries}
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
                  onPress={() =>
                    confirm(
                      t.book.removeConfirm,
                      t.book.yes,
                      () => {
                        removeAmount(data, e.id, { onFailed: () => notify(t.book.failed, "error") });
                        setData(peekSection(id) ?? data);
                      },
                      t.book.no,
                    )
                  }
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
