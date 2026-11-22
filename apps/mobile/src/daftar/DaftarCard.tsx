import { useState } from "react";
import { Alert, Linking, Pressable, Share, StyleSheet, Text, View } from "react-native";
import type { DaftarEntry } from "@fakkarni/shared";
import { fill, whatsappShareUrl } from "@/circles/logic";
import { t } from "@/i18n";
import { cancelDaftar, daftarShareText, respondDaftar, settleDaftar } from "@/lib/api";
import { colors } from "@/lib/theme";
import { entryActions, formatMoney, type DaftarAction } from "./logic";

const openWhatsApp = (text: string) => Linking.openURL(whatsappShareUrl(text)).catch(() => Share.share({ message: text }));

/** One shared entry with the actions this person can take. `onChanged` reloads the list. */
export function DaftarCard({ entry, onChanged }: { entry: DaftarEntry; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const amount = formatMoney(entry.amount);

  const run = async (action: DaftarAction) => {
    if (busy) return;
    if (action === "pay") {
      Alert.alert(fill(t.daftar.payHint, { amount }), undefined, [
        { text: t.daftar.no, style: "cancel" },
        { text: t.daftar.actions.pay, onPress: () => entry.pay_link && void Linking.openURL(entry.pay_link).catch(() => Alert.alert(t.daftar.failed)) },
      ]);
      return;
    }
    if (action === "cancel") {
      Alert.alert(t.daftar.cancelConfirm, undefined, [
        { text: t.daftar.no, style: "cancel" },
        { text: t.daftar.yes, style: "destructive", onPress: () => void work(() => cancelDaftar(entry.id)) },
      ]);
      return;
    }
    if (action === "resend" || action === "nudge") {
      return work(async () => {
        const text = await daftarShareText(entry.id);
        if (text) await openWhatsApp(text);
      });
    }
    if (action === "settle") return work(() => settleDaftar(entry.id));
    return work(() => respondDaftar(entry.id, action));
  };

  const work = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } catch {
      Alert.alert(t.daftar.failed);
    } finally {
      setBusy(false);
    }
  };

  const actions = entryActions(entry);
  return (
    <View style={[styles.card, busy && styles.dim]}>
      <View style={styles.head}>
        <Text style={styles.name}>{entry.other_name}</Text>
        <Text style={[styles.status, entry.status === "confirmed" && styles.ok, entry.status === "disputed" && styles.warn]}>{t.daftar.status[entry.status]}</Text>
      </View>
      <Text style={styles.line}>{fill(entry.direction === "owed_to_me" ? t.daftar.owesMe : t.daftar.iOweLine, { amount })}</Text>
      {entry.note ? <Text style={styles.note}>{entry.note}</Text> : null}
      {actions.length ? (
        <View style={styles.actions}>
          {actions.map((a, n) => (
            <Pressable key={a} disabled={busy} onPress={() => void run(a)} style={({ pressed }) => [styles.action, n === 0 && styles.primary, pressed && styles.dim]} accessibilityRole="button">
              <Text style={[styles.actionText, n === 0 && styles.primaryText]}>{t.daftar.actions[a]}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, gap: 4 },
  dim: { opacity: 0.6 },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { flex: 1, fontSize: 16, fontWeight: "600", color: colors.text, textAlign: "left" },
  status: { fontSize: 12, color: colors.muted },
  ok: { color: colors.ok },
  warn: { color: colors.error },
  line: { fontSize: 15, color: colors.text, textAlign: "left" },
  note: { fontSize: 13, color: colors.muted, textAlign: "left" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  action: { borderWidth: 1, borderColor: colors.accent, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  actionText: { color: colors.accent, fontWeight: "600" },
  primary: { backgroundColor: colors.accent },
  primaryText: { color: "#fff" },
});
