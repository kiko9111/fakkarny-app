import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import type { MoneySection, Receipt } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { formatMoney } from "@/daftar/logic";
import { t } from "@/i18n";
import { track } from "@/lib/analytics";
import { getMoney, peekMoney, readReceipt } from "@/lib/api";
import { logAmount, makeSection } from "@/money/actions";
import { sameSection } from "@/money/logic";
import { pickPhotos } from "@/lib/photos";
import { handOffDraft } from "@/split/handoff";
import { draftFromReceipt, startPeople } from "@/split/logic";
import { Button, Card, Chip, Note, notify, palette, Screen, space, Text } from "@/ui";

type State = { step: "pick" } | { step: "reading" } | { step: "read"; receipt: Receipt } | { step: "error"; message: string; limit?: boolean };

/**
 * A receipt photo (owner decision, 2026-11-23: receipts and homework are the only photos). The
 * photo goes to the server once to be read and is never kept. The result fills a Daftar entry
 * (section picked here, confirmed with a tap) or the bill split. `?for=split` comes from the split
 * form: the reading goes straight back to it.
 */
export default function ReceiptScreen() {
  const params = useLocalSearchParams<{ for?: string }>();
  const forSplit = params.for === "split";
  const [state, setState] = useState<State>({ step: "pick" });
  const expenses = (list: MoneySection[]) => list.filter((s) => s.kind === "expense");
  const [sections, setSections] = useState<MoneySection[] | null>(() => {
    const saved = peekMoney();
    return saved ? expenses(saved.sections) : null;
  });
  const [sectionId, setSectionId] = useState<string | "new" | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (forSplit) return;
    getMoney()
      .then((m) => setSections(expenses(m.sections)))
      .catch(() => setSections((s) => s ?? []));
  }, [forSplit]);

  const snap = async (source: "camera" | "library") => {
    let picked;
    try {
      picked = await pickPhotos(source, 1);
    } catch {
      return notify(t.receipt.failed, "error");
    }
    if (!picked) return;
    if ("denied" in picked) return notify(t.receipt.denied);
    if ("tooBig" in picked) return notify(t.receipt.tooBig);
    setState({ step: "reading" });
    try {
      const res = await readReceipt(picked.photos[0]!);
      track("receipt_read", { ok: !!res.receipt, items: res.receipt?.items.length ?? 0, for: forSplit ? "split" : "daftar" });
      if (res.error === "limit") return setState({ step: "error", message: t.receipt.limit, limit: true });
      if (!res.receipt) return setState({ step: "error", message: t.receipt.unreadable });
      if (forSplit) {
        handOffDraft(draftFromReceipt(res.receipt, startPeople(t.split.me, null)));
        return router.back();
      }
      setState({ step: "read", receipt: res.receipt });
    } catch {
      setState({ step: "error", message: t.receipt.failed });
    }
  };

  const guess = (r: Receipt) => {
    const name = r.category.trim() || t.receipt.defaultSection;
    const match = sameSection(sections ?? [], name, "expense", null);
    return { name, match };
  };

  // Pre-select the section the receipt's kind matches, or offer a new one with that name.
  useEffect(() => {
    if (state.step !== "read" || sections === null || sectionId !== null) return;
    const { match } = guess(state.receipt);
    setSectionId(match?.id ?? (sections.length ? sections[0]!.id : "new"));
  }, [state, sections, sectionId]);

  // Local-first: shown in the Daftar at once, sent behind (and resent if the connection drops).
  const log = (r: Receipt) => {
    if (busy || !sectionId) return;
    setBusy(true);
    const onFailed = () => notify(t.receipt.failed, "error");
    const section =
      sectionId === "new" ? makeSection({ name: guess(r).name.slice(0, 40), kind: "expense", budget: null, circle_id: null }, { onFailed }).section : sections?.find((s) => s.id === sectionId);
    if (!section) return setBusy(false);
    logAmount(section.id, { amount: r.total, note: r.merchant.slice(0, 80) || null, split: null }, { onFailed, onQueued: () => notify(t.book.waiting) });
    track("receipt_logged", {});
    notify(fill(t.receipt.logged, { name: section.name }));
    router.back();
  };

  const split = (r: Receipt) => {
    track("receipt_split", {});
    handOffDraft(draftFromReceipt(r, startPeople(t.split.me, null)));
    router.replace("/split/new");
  };

  const pickButtons = (
    <View style={styles.buttons}>
      <Button label={t.receipt.camera} icon="camera-outline" block size="lg" onPress={() => void snap("camera")} />
      <Button label={t.receipt.library} icon="images-outline" kind="tonal" block onPress={() => void snap("library")} />
    </View>
  );

  return (
    <Screen contentStyle={styles.content}>
      <Stack.Screen options={{ title: t.receipt.title }} />
      {state.step === "pick" ? (
        <>
          <Text variant="body">{t.receipt.intro}</Text>
          <Note icon="sparkles-outline">{t.receipt.costNote}</Note>
          {pickButtons}
        </>
      ) : null}

      {state.step === "reading" ? <Button label={t.receipt.reading} busy block size="lg" onPress={() => undefined} /> : null}

      {state.step === "error" ? (
        <>
          <Note icon="alert-circle-outline" tone="warn">
            {state.message}
          </Note>
          {state.limit ? <Button label={t.paywall.cta} icon="sparkles" block onPress={() => router.push("/paywall")} /> : pickButtons}
        </>
      ) : null}

      {state.step === "read" ? (
        <>
          <Card style={styles.card}>
            <Text variant="headline">{state.receipt.merchant || t.split.untitled}</Text>
            <Text variant="number">{fill(t.ui.pounds, { n: formatMoney(state.receipt.total) })}</Text>
            {state.receipt.date ? (
              <Text variant="small" color={palette.inkSoft}>
                {fill(t.receipt.date, { d: state.receipt.date })}
              </Text>
            ) : null}
            {state.receipt.service > 0 || state.receipt.vat > 0 ? (
              <Text variant="small" color={palette.inkSoft}>
                {[state.receipt.service > 0 ? fill(t.receipt.service, { n: formatMoney(state.receipt.service) }) : "", state.receipt.vat > 0 ? fill(t.receipt.vat, { n: formatMoney(state.receipt.vat) }) : ""].filter(Boolean).join(" · ")}
              </Text>
            ) : null}
            {state.receipt.items.length ? (
              <View style={styles.items}>
                <Text variant="smallStrong" color={palette.inkSoft}>
                  {fill(t.receipt.items, { n: state.receipt.items.length })}
                </Text>
                {state.receipt.items.slice(0, 12).map((it, i) => (
                  <View key={i} style={styles.line}>
                    <Text variant="small" style={styles.flex} numberOfLines={1}>
                      {it.qty > 1 ? `${it.name} ×${it.qty}` : it.name}
                    </Text>
                    <Text variant="small">{formatMoney(it.price)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </Card>

          <Text variant="headline">{t.receipt.where}</Text>
          <View style={styles.wrap}>
            {sections?.map((s) => (
              <Chip key={s.id} label={s.circle_name ? `${s.name} · ${s.circle_name}` : s.name} selected={sectionId === s.id} onPress={() => setSectionId(s.id)} />
            ))}
            {!guess(state.receipt).match ? <Chip icon="add" label={fill(t.receipt.newSection, { name: guess(state.receipt).name })} selected={sectionId === "new"} onPress={() => setSectionId("new")} /> : null}
          </View>
          <Button label={fill(t.receipt.log, { n: formatMoney(state.receipt.total) })} icon="checkmark" block size="lg" busy={busy} disabled={!sectionId} onPress={() => void log(state.receipt)} />
          <Button label={t.receipt.split} icon="people-outline" kind="tonal" block onPress={() => split(state.receipt)} />
          <Button label={t.receipt.again} icon="camera-outline" kind="text" block onPress={() => setState({ step: "pick" })} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.md },
  buttons: { gap: space.sm },
  card: { gap: space.xs },
  items: { gap: space.xs, marginTop: space.sm },
  line: { flexDirection: "row", gap: space.sm },
  flex: { flex: 1 },
  wrap: { flexDirection: "row", gap: space.xs, flexWrap: "wrap" },
});
