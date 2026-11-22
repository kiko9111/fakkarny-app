import { useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { whatsappShareUrl } from "@/circles/logic";
import { parseAmount } from "@/daftar/logic";
import { upsertItem } from "@/db/messages";
import { t } from "@/i18n";
import { createDaftar, patchItem } from "@/lib/api";
import { colors } from "@/lib/theme";

/**
 * New shared entry: who, how much, which way. Saving opens WhatsApp with the confirm link,
 * sent from the user's own number. Can start from a private Money note (`itemId`), which
 * is then closed so the amount isn't counted twice.
 */
export default function NewDaftarScreen() {
  const params = useLocalSearchParams<{ name?: string; amount?: string; direction?: string; itemId?: string }>();
  const [name, setName] = useState(params.name ?? "");
  const [amountText, setAmountText] = useState(params.amount ?? "");
  const [direction, setDirection] = useState<"owed_to_me" | "i_owe">(params.direction === "i_owe" ? "i_owe" : "owed_to_me");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const amount = parseAmount(amountText);
  const ready = name.trim().length > 0 && amount !== null;

  const submit = async () => {
    if (!ready || busy || amount === null) return;
    setBusy(true);
    try {
      const { share_text } = await createDaftar({ other_name: name.trim(), direction, amount, ...(note.trim() ? { note: note.trim() } : {}) });
      if (params.itemId) await patchItem(params.itemId, { status: "done" }).then(upsertItem).catch(() => {});
      if (share_text) await Linking.openURL(whatsappShareUrl(share_text)).catch(() => Share.share({ message: share_text }));
      router.back();
    } catch {
      Alert.alert(t.daftar.failed);
      setBusy(false);
    }
  };

  const choice = (value: "owed_to_me" | "i_owe", label: string) => (
    <Pressable style={[styles.choice, direction === value && styles.choiceOn]} onPress={() => setDirection(value)} accessibilityRole="button">
      <Text style={[styles.choiceText, direction === value && styles.choiceTextOn]}>{label}</Text>
    </Pressable>
  );

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: t.daftar.newTitle }} />
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder={t.daftar.name} maxLength={40} autoFocus={!params.name} />
      <View style={styles.row}>
        {choice("owed_to_me", t.daftar.theyOwe)}
        {choice("i_owe", t.daftar.iOwe)}
      </View>
      <TextInput style={styles.input} value={amountText} onChangeText={setAmountText} placeholder={t.daftar.amount} keyboardType="decimal-pad" maxLength={12} />
      <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder={t.daftar.note} maxLength={120} />
      <Pressable style={[styles.primary, (!ready || busy) && styles.dim]} disabled={!ready || busy} onPress={() => void submit()} accessibilityRole="button">
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{t.daftar.send}</Text>}
      </Pressable>
      <Text style={styles.hint}>{t.daftar.intro}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 24, gap: 12 },
  input: { backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 17, color: colors.text, writingDirection: "auto" },
  row: { flexDirection: "row", gap: 8 },
  choice: { flex: 1, borderWidth: 1, borderColor: colors.accent, borderRadius: 14, paddingVertical: 10, alignItems: "center" },
  choiceOn: { backgroundColor: colors.accent },
  choiceText: { color: colors.accent, fontWeight: "600" },
  choiceTextOn: { color: "#fff" },
  primary: { backgroundColor: "#25A35A", borderRadius: 16, paddingVertical: 14, alignItems: "center" },
  primaryText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  dim: { opacity: 0.5 },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: "center" },
});
