import { useState } from "react";
import { Linking, Share, StyleSheet, View } from "react-native";
import type { DaftarEntry, DaftarStatus } from "@fakkarni/shared";
import { fill, whatsappShareUrl } from "@/circles/logic";
import { t } from "@/i18n";
import { cancelDaftar, daftarShareText, respondDaftar, settleDaftar } from "@/lib/api";
import { ask, Badge, Button, Card, confirm, notify, palette, PersonAvatar, space, Text, type IconName } from "@/ui";
import { entryActions, formatMoney, type DaftarAction } from "./logic";

const openWhatsApp = (text: string) => Linking.openURL(whatsappShareUrl(text)).catch(() => Share.share({ message: text }));
const TONE: Record<DaftarStatus, "neutral" | "ok" | "warn" | "danger"> = { pending: "warn", confirmed: "ok", disputed: "danger", settled: "neutral", cancelled: "neutral" };
const ICON: Partial<Record<DaftarAction, IconName>> = { confirm: "checkmark", resend: "logo-whatsapp", nudge: "logo-whatsapp", pay: "card-outline", settle: "checkmark-done" };

/** One shared entry with the actions this person can take. `onChanged` reloads the list. */
export function DaftarCard({ entry, onChanged }: { entry: DaftarEntry; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const amount = formatMoney(entry.amount);
  const owedToMe = entry.direction === "owed_to_me";

  const work = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } catch {
      notify(t.daftar.failed, "error");
    } finally {
      setBusy(false);
    }
  };

  const run = async (action: DaftarAction) => {
    if (busy) return;
    if (action === "pay") {
      ask(fill(t.daftar.payHint, { amount }), undefined, [
        { label: t.daftar.no, style: "cancel" },
        { label: t.daftar.actions.pay, onPress: () => entry.pay_link && void Linking.openURL(entry.pay_link).catch(() => notify(t.daftar.failed, "error")) },
      ]);
      return;
    }
    if (action === "cancel") return confirm(t.daftar.cancelConfirm, t.daftar.yes, () => void work(() => cancelDaftar(entry.id)), t.daftar.no);
    if (action === "resend" || action === "nudge") {
      return work(async () => {
        const text = await daftarShareText(entry.id);
        if (text) await openWhatsApp(text);
      });
    }
    if (action === "settle") return work(() => settleDaftar(entry.id));
    return work(() => respondDaftar(entry.id, action));
  };

  const actions = entryActions(entry);
  const settled = entry.status === "settled";
  return (
    <Card style={busy ? styles.dim : undefined}>
      <View style={styles.head}>
        <PersonAvatar name={entry.other_name} color={owedToMe ? palette.ok : palette.primaryInk} bg={owedToMe ? palette.okSoft : palette.primarySoft} />
        <View style={styles.flex}>
          <Text variant="bodyStrong">{entry.other_name}</Text>
          <Text variant="small" color={palette.inkSoft} numberOfLines={1}>
            {entry.note ?? (owedToMe ? t.ui.owedToYou : t.ui.youOwe)}
          </Text>
        </View>
        <View style={styles.amount}>
          <Text variant="headline" color={settled ? palette.inkFaint : owedToMe ? palette.ok : palette.primaryInk} style={settled ? styles.struck : undefined}>
            {owedToMe ? "+" : "−"}
            {fill(t.ui.pounds, { n: amount })}
          </Text>
          <Badge label={t.daftar.status[entry.status]} tone={TONE[entry.status]} />
        </View>
      </View>
      {actions.length ? (
        <View style={styles.actions}>
          {actions.map((a, n) => (
            <Button
              key={a}
              label={t.daftar.actions[a]}
              icon={ICON[a]}
              size="sm"
              kind={a === "resend" || a === "nudge" ? (n === 0 ? "whatsapp" : "outline") : n === 0 ? "filled" : a === "cancel" || a === "dispute" ? "danger" : "outline"}
              disabled={busy}
              onPress={() => void run(a)}
            />
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  dim: { opacity: 0.6 },
  flex: { flex: 1, minWidth: 0 },
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
  amount: { alignItems: "flex-end", gap: 4 },
  struck: { textDecorationLine: "line-through" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.xs },
});
